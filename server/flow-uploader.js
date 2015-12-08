'use strict';

var Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs.extra'));
const path = require('path');
const crypto = require('crypto');
const CronJob  = require('cron').CronJob;

module.exports = class FlowUploader {
    constructor(tempDir, uploadDir, maxFileSize, fileParameterName) {
        this.tempDir = tempDir || './server/tmp';
        this.uploadDir = uploadDir || './server/uploads';
        this.maxFileSize = maxFileSize;
        this.finalFile = "";
        this.fileParameterName = fileParameterName || 'file';

        try {
            fs.mkdirSync(this.tempDir);
        } catch (e) {}

        //run clean up job five minutes after midnight, every day
        new CronJob('5 0 * * *', () => { this._cleanUnfinishedChunks(); }, null, true, 'Europe/Zurich');
    }

    chunkExists(req) {
        console.log("chunkExists");
        let chunkNumber = req.query.flowChunkNumber,
            chunkSize = req.query.flowChunkSize,
            totalSize = req.query.flowTotalSize,
            identifier = req.query.flowIdentifier,
            fileName = req.query.flowFilename;

        let validation = this._isValidRequest(chunkNumber, chunkSize, totalSize, identifier, fileName);

        console.log("Validation: " + validation);
        if (validation !== 'VALID') {
            return Promise.reject(validation);
        }

        let chunkFilename = this._getChunkFilename(chunkNumber, identifier);

        return fs.statAsync(chunkFilename);
    }

    saveChunk(req, newFileName) {
        console.log("saveChunk");
        let fields = req.body,
            files = req.files;

        let chunkNumber = Number(fields.flowChunkNumber),
            chunkSize = Number(fields.flowChunkSize),
            totalSize = Number(fields.flowTotalSize),
            identifier = fields.flowIdentifier,
            fileName = fields.flowFilename;

        if (!files[this.fileParameterName] || !files[this.fileParameterName].size) {
            console.log('INVALID_FLOW_REQUEST');
            return Promise.reject('INVALID_FLOW_REQUEST');
        }
        console.log("valid flow request");

        let validation = this._isValidRequest(chunkNumber, chunkSize, totalSize, identifier, fileName, files[this.fileParameterName].size);

        if (validation !== 'VALID') {
            console.log(validation);
            return Promise.reject(validation);
        }

        console.log("validation done")

        let chunkFilename = this._getChunkFilename(chunkNumber, identifier);

        console.log(chunkFilename);

        return fs.moveAsync(files[this.fileParameterName].path, chunkFilename)
                .then(() => {
                    console.log('renameAsync');
                    let numberOfChunks = this._getNumberOfChunks(totalSize, chunkSize);
                    console.log(numberOfChunks + " / " + chunkNumber);
                    if (chunkNumber !== numberOfChunks) {
                        return 'PARTLY_DONE';
                    }

                    console.log("full done");

                    let chunkFileNames = [];
                    for (let i = 1; i <= numberOfChunks; i++) {
                        chunkFileNames.push(this._getChunkFilename(i, identifier));
                    }
                    //console.log(chunkFileNames);
                    console.log(fileName);
                    return Promise.map(
                        chunkFileNames,
                        chunkFileName => fs.statAsync(chunkFileName),
                        {concurency: 2}
                    ).then(() => this._writeToUploadDir(numberOfChunks, identifier, fileName))
                    .then(filename => filename, () => 'ERROR_VERIFY_CHUNK').then(() => fs.move(this.finalFile, (path.resolve(this.uploadDir)+"\\"+newFileName+".jpg")));
                });
    }

    download(fileName) {
        let downloadPath = this._getDownloadPath(fileName);
        return fs.statAsync(downloadPath).then(() => {
            return fs.createReadStream(downloadPath);
        });
    }

    _isValidRequest(chunkNumber, chunkSize, totalSize, identifier, fileName, fileSize) {
        identifier = this._cleanIdentifier(identifier);

        if (!chunkNumber || !chunkSize || !totalSize || !identifier || !fileName) {
            return 'INVALID_FLOW_REQUEST';
        }

        let numberOfChunks = this._getNumberOfChunks(totalSize, chunkSize);

        if (chunkNumber > numberOfChunks) {
            return 'INVALID_CHUNK_NUMBER';
        }

        if (this.maxFileSize && totalSize > this.maxFileSize) {
            return 'INVALID_FILE_SIZE';
        }

        if (typeof fileSize !== 'undefined') {
            if (chunkNumber < numberOfChunks && fileSize !== chunkSize) {
                console.log('>>>>.', typeof fileSize, typeof chunkSize);
                return 'INVALID_FILESIZE_CHUNKSIZE_MISMATCH';
            }

            if (numberOfChunks > 1 && chunkNumber === numberOfChunks && fileSize !== ((totalSize % chunkSize) + parseInt(chunkSize))) {
                return 'INVALID_LAST_CHUNK';
            }

console.log(fileSize);
console.log(totalSize);
            if (numberOfChunks === 1 && fileSize !== totalSize) {
                return 'INVALID_SINGLE_CHUNK';
            }
        }

        return 'VALID';
    }

    _getNumberOfChunks(totalSize, chunkSize) {
        return Math.max(Math.floor(totalSize/chunkSize), 1);
    }

    _cleanIdentifier(identifier) {
        return identifier.replace(/[^0-9A-Za-z_-]/g, '');
    }

    _getChunkFilename(chunkNumber, identifier) {
        identifier = this._cleanIdentifier(identifier);
        let hash = crypto.createHash('sha1').update(identifier).digest('hex');
        return path.resolve(this.tempDir, `./${identifier}-${hash}.${chunkNumber}`);
    }

    _getDownloadPath(fileName) {
        return path.resolve(this.uploadDir, `./${fileName}`);
    }

    _writeToUploadDir(numberOfChunks, identifier, fileName) {
        console.log("_writeToUploadDir");
        let hash = crypto.createHash('sha1').update(identifier).digest('hex');
        let writeDir = path.resolve(this.uploadDir, `./${identifier}-${hash}${path.extname(fileName)}`);
        this.finalFile = writeDir;
        //console.log(writeDir);
        //console.log(path.resolve(this.uploadDir));
        let writableStream = fs.createWriteStream(writeDir);

        let chunkFileNames = [];
        for (let i = 1; i <= numberOfChunks; i++) {
            chunkFileNames.push(this._getChunkFilename(i, identifier));
        }

        return Promise.each(
            chunkFileNames,
            chunkFileName => {
                return new Promise(resolve => {
                    let sourceStream = fs.createReadStream(chunkFileName);
                    sourceStream.pipe(writableStream, {
                        end: false
                    });
                    sourceStream.on('end', function() {
                        fs.unlink(chunkFileName);
                        resolve();
                    });
                });
            }
        ).then(() => {
            writableStream.end();
            return path.basename(writeDir);
        });
    }

    _cleanUnfinishedChunks() {
        let now = new Date().getTime();
        let oneDay = 24 * 60 * 60 * 1000;
        fs.readdirAsync(this.tempDir)
            .map(fileName => {
                let filePath = path.resolve(this.tempDir, `./${fileName}`);
                return fs.statAsync(filePath).then(stat => {
                    return {
                        filePath: filePath,
                        stat: stat
                    };
                });
            }, {concurency: 2})
            .filter(fileStat => {
                let modifiedTime = fileStat.stat.ctime.getTime();
                return (now - modifiedTime) >= oneDay;
            })
            .each(fileStat => fs.unlinkAsync(fileStat.filePath));
    }
};
