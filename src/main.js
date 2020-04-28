const FS = require("fs");


var countries = {};
var banks = [];

const banksFile = JSON.parse(FS.readFileSync("../banks.json", "utf8"));

for (countryObject of banksFile) {

    let countryCode = countryObject.code.toLowerCase();
    countries[countryCode] = countryObject.name;

    for (bankObject of countryObject.list) {

        bankObject.country = countryCode;
        banks.push(bankObject);

    }

}
