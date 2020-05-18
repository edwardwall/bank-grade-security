const FS = require("fs");
const PATH = require("path");

const PATHS = {
    BANKS: "../banks/",
    HTML: "../html/",
    HISTORY: "../history/",
    OUTPUT: "../../bankgradesecurity.com/", // Intentionally outside repository
    RESOURCES: "../resources/",
    IMAGES: "../images/"
};

const TEMPLATES = getTemplates();
const DETAILS = getBankDetails();
const {RESULTS, HISTORY} = getResultsHistory();

var countries = [];
var cards = [];

// Check output directory exists
try {
    FS.readdirSync(PATH.resolve(__dirname, PATHS.OUTPUT));
} catch (e) {
    console.log("Output directory does not exist.");
    console.log("Create directory 'bankgradesecurity.com' alongside this repository.");
    throw "Output directory does not exist";
}

writeStandardFiles();

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
        let previous = getPrevious(countryCode, bankName);

        writeBankPage(countryCode, countryName, bankName, urlSafeBankName,
            domain, score, grade, bankResults, previous);

        let card = {
            score,
            bankName,
            html: makeCard(countryCode, bankName, urlSafeBankName, domain, score, grade)
        };

        countryCards.push(card);
        cards.push(card);
    }

    writeCountryPage(countryCode, countryName, countryCards);
}

writeHomePage(cards);



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
 * Function to retrieve previous results.
 */
function getPrevious(country, name) {

    let previous = [];

    for (scan of HISTORY) {

        let data;

        try {
            data = scan[country][name];
        } catch (e) {}

        if (undefined === data) {
            break;
        }

        let score = calculateScore(data);
        let grade = calculateGrade(score);

        previous.push({
            year:  scan.date.year,
            month: scan.date.month,
            score,
            grade
        });

    }

    return previous;

}


/**
 * Function to write bank HTML file.
 */
function writeBankPage(countryCode, countryName, bankName, urlSafeBankName,
    domain, score, grade, results, previous) {

    try {
        FS.mkdirSync(PATH.resolve(__dirname, PATHS.OUTPUT, countryCode));
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

    page = page.replace("$main", makeBankMain(results, previous));

    writeFile(page, countryCode+"/" + urlSafeBankName+".html");

}


/**
 * Function to read in and prepare HTML files.
 */
function getTemplates() {

    let filenames = FS.readdirSync(PATH.resolve(__dirname, PATHS.HTML));
    let files = {};

    for (filename of filenames) {
        files[filename] = FS.readFileSync(PATH.resolve(__dirname, PATHS.HTML, filename), "utf8");
    }

    let templates = {};

    for (filename in files) {

        if (filename.toLowerCase().includes("header") ||
            filename.toLowerCase().includes("footer")) {

            continue;
        }

        files[filename] = files[filename]
            .replace("$header", files.templateHeader)
            .replace("$footer", files.templateFooter);

        let key = filename.substring(0, filename.indexOf(".")); // remove file extension

        templates[key.toUpperCase()] = files[filename];
    }

    return templates;
}


/**
 * Function to make the main section of the bank HTML page.
 */
function makeBankMain(results, previous) {

    let main = "";

    let categoryHtmlTop = "<section><div class=top>$category</div>";
    let categoryHtmlBottom = "</section>";

    for (category in results) {
        main += categoryHtmlTop.replace("$category", category);

        for (metric in results[category]) {
            let result = results[category][metric];
            let grade;
            let check;

            if ("boolean" == typeof result) {
                grade = (result ? "A" : "E");
                check = (result ? "&check;" : "&cross;");
            } else {
                grade = "";
                check = (("" === result) ? "<i>hidden</i>" : htmlEncode(result));
            }

            main +=
                "<div class=measure>\
                <span>" + metric + "</span>\
                <div class=results>\
                <div class=\"result "+grade+"\">"+check+"</div>\
                </div>\
                </div>";
        }

        main += categoryHtmlBottom;
    }

    // Add History section if applicable
    if (0 < previous.length) {
        main += categoryHtmlTop.replace("$category", "History");

        for (result of previous) {
            let date = result.month.substring(0, 3) +" "+ result.year;

            main +=
                "<div class=history>\
                <div class=\"grade " +result.grade+ "\">" +result.score+ "</div>\
                <p>" +date+ "</p>\
                </div>";
        }

        main += categoryHtmlBottom;
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
 * Function to create a bank's HTML card.
 */
function makeCard(countryCode, bankName, urlSafeBankName, domain, score, grade) {

    let card =
        "<a class=card href=https://bankgradesecurity.com/"+countryCode+"/"+urlSafeBankName+">\
        <div class=\"grade "+grade+">" +score+ "</div>\
        <div class=name>" +bankName+ "</div>\
        <div class=details>" +countryCode.toUpperCase()+ "</div><div class=details>" +domain+ "</div>\
        </a>";

    return card;
}


/**
 * Function to sort HTML cards.
 */
function sortCards(cards) {

    return cards.sort((a, b) => {

        if (a.score < b.score) {
            return 1;
        } else if (a.score > b.score) {
            return -1;
        }

        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        }

        return 0;

    });

}


/**
 * Function to create a country's HTML page.
 */
function writeCountryPage(code, name, cards) {

    let page = TEMPLATES.COUNTRY;

    page = page.replace(/\$countryCode/g, code);
    page = page.replace(/\$countryName/g, name);

    cards = sortCards(cards);

    let main = "";

    for (card of cards) {
        main += card.html;
    }

    page = page.replace("$main", main);

    writeFile(page, code+".html");

}


/**
 * Function to create the homepage.
 */
function writeHomePage(cards) {

    let page = TEMPLATES.HOMEPAGE;

    let replace = [];

    for (country of countries) {
        replace.push(
            "<a href=https://bankgradesecurity.com/" + country.countryCode +
            ">" + country.countryName + "</a>"
        );
    }

    page = page.replace("$countries", replace.join("\n"));
    card = sortCards(cards);

    let main = "";

    for (card of cards) {
        main += card.html;
    }

    page = page.replace("$main", main);

    writeFile(page, "index.html");

}


/**
 * Function to get details of banks from JSON file.
 */
function getBankDetails() {

    let details = {};

    for (filename of FS.readdirSync(PATH.resolve(__dirname, PATHS.BANKS))) {

        let file;
        file = FS.readFileSync(PATH.resolve(__dirname, PATHS.BANKS, filename));
        file = JSON.parse(file);

        details[file.code] = {
            name: file.name,
            banks: {}
        };

        for (bankObject of file.list) {

            details[file.code].banks[bankObject.name] = bankObject.domain;

        }

    }

    return details;

}


/**
 * Function to write a given file to the given location.
 */
function writeFile(file, location) {

    FS.writeFileSync(PATH.resolve(__dirname, PATHS.OUTPUT, location), file);

}


/**
 * Function to get latest set of results and previous results.
 */
function getResultsHistory() {

    let dir = FS.readdirSync(PATH.resolve(__dirname, PATHS.HISTORY)).reverse();
    let history = [];

    for (filename of dir) {

        let file;
        file = FS.readFileSync(PATH.resolve(__dirname, PATHS.HISTORY, filename), "utf8");
        file = JSON.parse(file);

        file.date = {
            year:  parseInt(filename.substring(0, 4)),
            month: parseInt(filename.substring(4, 6))
        };

        file.date.month = getMonth(file.date.month);

        history.push(file);

    }

    delete history[0].date; // remove date from results

    return {
        RESULTS: history.splice(0, 1)[0],
        HISTORY: history
    };

}


/**
 * Function to return the months name.
 */
function getMonth(month) {

    const MONTHS = [
        undefined, // make months index one-based
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];

    return MONTHS[month];

}


/**
 * Function to move standard files into website directory.
 */
function writeStandardFiles() {

    writeFile("bankgradesecurity.com", "CNAME");// CNAME for GitHub

    const DIR = "resources/";

    try {
        FS.mkdirSync(PATH.resolve(__dirname, PATHS.OUTPUT, DIR));
    } catch (e) {}


    for (directory of [PATHS.RESOURCES, PATHS.IMAGES]) {

        let files = FS.readdirSync(PATH.resolve(__dirname, directory));

        for (filename of files) {

            let file = FS.readFileSync(PATH.resolve(__dirname, directory, filename));
            writeFile(file, DIR + filename);

        }

    }

}
