const FS = require("fs");

const PATHS = {
    HTML  : "../html/",
    OUTPUT: "../docs/"
};

const TEMPLATES = getTemplates();
const DETAILS = getBankDetails();
const RESULTS = JSON.parse(FS.readFileSync("../output.json", "utf8"));

var countries = [];
var cards = [];

for (countryCode in RESULTS) {

    let countryResults = RESULTS[countryCode];

    let countryName = DETAILS[countryCode].name;
    let countryCards = [];

    countries.push({
        countryCode,
        countryName
    });

    for (bankName in countryResults) {

        let bankResults = countryResults[bankName];

        let urlSafeBankName = makeUrlSafe(bankName);
        let domain = DETAILS[countryCode]["banks"][bankName];

        let score = calculateScore(bankResults);
        let grade = calculateGrade(score);

        writeBankPage(countryCode, countryName, bankName, urlSafeBankName,
            domain, score, grade, bankResults);

    }

}


/**
 * Function to make a string safe for use in URL.
 */
function makeUrlSafe(str) {

    str = str.toLowerCase();
    str = str.replace(/ /g, "-");
    str = str.replace(/&/g, "-");
    str = str.replace(/'/g, "");

    return str;

}


/**
 * Function to calculate a bank's score from the results.
 */
function calculateScore(results) {

    let score = 0;
    let total = 0;

    for (category in results) {
        for (metric in results[category]) {

            let result = results[category][metric];

            if ("boolean" === typeof result) {

                total += 1;

                if (result) {
                    score += 1;
                }

            }

        }
    }

    score = 100 * score;
    score = score / total;
    score = Math.round(score);

    return score;

}


/**
 * Function to return a bank's grade from the score.
 */
function calculateGrade(score) {

    score = Math.floor(score / 20);
    return ["E", "D", "C", "B", "A", "Z"][score];

}


/**
 * Function to write bank HTML file.
 */
function writeBankPage(countryCode, countryName, bankName, urlSafeBankName,
    domain, score, grade, results) {

    try {
        FS.mkdirSync(PATHS.OUTPUT + countryCode);
    } catch (e) {}

    let page = TEMPLATES.BANK;

    page = page.replace(/\$countryCode/g, countryCode);
    page = page.replace(/\$upperCountryCode/g, countryCode.toUpperCase());
    page = page.replace(/\$name/g, bankName);
    page = page.replace(/\$score/g, score);
    page = page.replace(/\$grade/g, grade);

    page = page.replace(/\$countryName/g, countryName);
    page = page.replace(/\$domain/g, domain);

    page = page.replace(/\$explanation/g, bankName + " " + getExplanation(grade));
    page = page.replace(/\$urlSafeName/g, urlSafeBankName);

    page = page.replace("$main", makeBankMain(results));

}


/**
 * Function to read in and prepare HTML files.
 */
function getTemplates() {

    let filenames = FS.readdirSync(PATHS.HTML);

    let templates = {};

    for (filename of filenames) {

        let key = filename.substring(0, filename.indexOf('.'));
        templates[key] = FS.readFileSync(PATHS.HTML + filename, "utf8");

    }

    let ret = {};

    for (key in templates) {

        if (key.toLowerCase().includes("header") ||
            key.toLowerCase().includes("footer")) {

            continue;
        }

        if (key.startsWith("template")) {
            ret[key.toUpperCase()] = templates[key];
            continue;
        }

        templates[key] = templates[key]
            .replace("$header", templates.templateHeader)
            .replace("$footer", templates.templateFooter);

        ret[key.toUpperCase()] = templates[key];

    }

    return ret;

}


/**
 * Function to make the main section of the bank HTML page.
 */
function makeBankMain(results) {

    let main = "";

    for (category in results) {

        main += TEMPLATES.TEMPLATECATEGORY;
        main = main.replace("$title", category);

        for (metric in results[category]) {

            let result = results[category][metric];

            main = main.replace("$metric", TEMPLATES.TEMPLATEMETRIC + "$metric");
            main = main.replace("$title", metric);

            if ("boolean" === typeof result) {

                main = main.replace("$result", TEMPLATES.TEMPLATERESULT);
                main = main.replace("$grade", (result ? "A" : "E"));
                main = main.replace("$check", (result ? "&check;" : "&cross;"));

            } else if ("" === result) {
                main = main.replace("$result", "hidden");
            } else {
                main = main.replace("$result", htmlEncode(result));
            }

        }

        main = main.replace("$metric", "");

    }

    return main;

}


/**
 * Function to encode unsafe HTML characters.
 */
function htmlEncode(string) {

    let replace = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    };

    for (c in replace) {
        string = string.split(c).join(replace[c]);
    }

    return string;

}


/**
 * Function to return the grade-based explanation.
 */
function getExplanation(grade) {

    if (grade == "Z") {
        return "has excellent website security. They have passed every test.";

    } else if (grade == "A") {
        return "has very good security. They have passed almost every test.";

    } else if (grade == "B") {
        return "has above average security. They have passed most of the tests.";

    } else if (grade == "C") {
        return "has average security. They have failed around half of the tests.";

    } else if (grade == "D") {
        return "has below average security. They have failed most of the tests.";

    } else if (grade == "E") {
        return "has very bad security. They have failed almost every on of the tests.";
    }

}


/**
 * Function to get details of banks from JSON file.
 */
function getBankDetails() {

    const FILE = JSON.parse(FS.readFileSync("../banks.json", "utf8"));

    let details = {};

    for (countryObject of FILE) {

        let countryCode = countryObject.code;

        details[countryCode] = {
            name: countryObject.name,
            banks: {}
        };

        for (bankObject of countryObject.list) {

            details[countryCode]["banks"][bankObject.name] = bankObject.domain;

        }

    }

    return details;

}
