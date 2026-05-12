'use strict';

const fs = require("fs"),
    _packageInfo = require("./package.json")

let _versionInfo = fs.readFileSync('./src/version.json');

_versionInfo = JSON.parse(_versionInfo);
_versionInfo.version = _packageInfo.version
_versionInfo.name = _packageInfo.name
_versionInfo.buildTimestamp = (new Date()).toString()

let _data = JSON.stringify(_versionInfo)
fs.writeFileSync("./src/version.json", _data)

