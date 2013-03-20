var cheerio = require('cheerio'),
    request = require('request'),
    Q = require('q');

request.defaults({"pool.maxSockets": 20});
function getFormData(formNode, $) {
    var i, ii, option, name, type,
        node, nodes,
        o = {};
   
    formNode = $(formNode);

    nodes = formNode.find("input[name]");
    for (i = 0, ii = nodes.length; i < ii; ++i) {
        node = $(nodes[i]);
        name = node.attr('name');
        type = node.attr('type');

        if (type == 'submit') {
            continue;
        }

        if (type == 'checkbox') {
            o[name] = node.attr('checked') != null ? "on" : "";
        } else if (type == 'radio' && node.attr('checked')) {
            o[name] = node.attr('value');
        } else {
            o[name] = node.attr('value') || '';
        }
    }
    
    nodes = formNode.find("textarea[name]");
    for (i = 0, ii = nodes.length; i < ii; ++i) {
        node = $(nodes[i]);
        name = node.attr('name');
        o[name] = node.text() || '';
    }

    nodes = formNode.find("select[name]");
    for (i = 0, ii = nodes.length; i < ii; ++i) {
        node = $(nodes[i]);
        name = node.attr('name');
        option = node.find("option[selected]");
        o[name] = option.attr('value') || '';
    }

    return o;
}


function sortByOldest(response) {
    var deferred = Q.defer(),
        $ = cheerio.load(response.body),
        formData = getFormData($(response.body), $),
        name = $("[name*='SortDateOldest$AccessibleLink']").attr('name');
    
    formData['ctl00$ctl46$QueryTarget'] = 'lfc';
    formData[name] = "date+(oldest)";
    
    console.log("Sorting by oldest...");
    request({
        url: response.request.uri.href,
        method: "POST",
        form: formData,
        followAllRedirects: true
    }, function(error, response) {
        if (!error && response.statusCode == 200) {
            deferred.resolve(response);
        } else {
            deferred.reject(response);
        }
    });

    return deferred.promise;
}


function getSearchForm() {
    var deferred = Q.defer();

    request("http://www.classification.gov.au/Pages/Search.aspx", function(error, response) {
        if (error) {
            deferred.reject(response);
        } else {
            deferred.resolve(response);
        }
    });

    return deferred.promise;
}

function triggerPOST(url, formData) {
    var deferred = Q.defer();

    request({
        url: url,
        method: "POST",
        form: formData,
        followAllRedirects: true
    }, function(error, response) {
        if (error) {
            deferred.reject(response);
        } else {
            deferred.resolve(response);
        }
    });

    return deferred.promise;
}

function triggerSearch(formData) {
    return triggerPOST('http://www.classification.gov.au/Pages/Search.aspx', formData);
}

function getRecordsForYear(year) {
    year = parseInt(year, 10);
    console.log("Getting records...");

    getSearchForm()
    .then(function(response) {
        var $, formData, prefix;
        
        $ = cheerio.load(response.body);
        $('[id*=DateFromTextbox]').attr('value', year);
        $('[id*=DateToTextbox]').attr('value', year + 1);
        $('[id*=RestrictedCheckbox]').attr('checked', true);
        
        formData = getFormData($.root(), $);
        prefix = $('[id*=DateToTextbox]').attr('name').replace("DateToTextbox", "");
        formData['ctl00$ctl46$QueryTarget'] = 'lfc';
        formData[prefix + "SearchButton"] = '';

        return formData; 
    })
    .then(triggerSearch)
    .then(sortByOldest)
    //.then(function(o) { console.log(o); return o; })
    .then(scrapeResults); // scrapes them all!
}

function scrapeResults(response) {
    // For each page, scrape every URL out of it
    var page = new ResultsPage(response);
    console.log("Scraping classifications...");
    page.scrapeClassifications();

    if (page.hasNextPage()) {
        console.log("Next page!");
        page.nextPage().then(scrapeResults);
    } else {
        console.log("DONE!");
    }
}

function scrapeClassification(response) {
    //var page = new ClassificationsPage(response);
    console.log(cheerio.load(response.body)(".ncd-title-container .ncd-title").text().trim());
}


function getResultCount(node) {
    start = parseInt(node.find("[id*=PageStartIndexLabel]").text(), 10);
    end = parseInt(node.find("[id*=PageEndIndexLabel]").text(), 10);
    total = parseInt(node.find("[id*=TotalRowsLabel]").text(), 10);

    return [start, end, total];
}

function ResultsPage(response) {
    this.response = response
    this.$ = cheerio.load(response.body);
}

ResultsPage.prototype.hasNextPage = function() {
    return this.$(".pager-ctl a:last-child").attr('href');
}

ResultsPage.prototype.nextPage = function() {
    var formData = getFormData(this.$.root(), this.$),
        href = this.$(".pager-ctl a:last-child").attr('href');

    if (href == null) {
        return;
    }

    href = href.replace("javascript:__doPostBack('", "").replace("','')", "");
    formData.__EVENTTARGET = href;

    return triggerPOST(this.response.request.uri.href, formData);
}

ResultsPage.prototype.getClassificationLinks = function() {
    return this.$(".ncd-results-table table input[type='submit']");
}

ResultsPage.prototype.scrapeClassifications = function() {
    var $ = this.$,
        response = this.response,
        formData = getFormData(this.$.root(), this.$);

    this.getClassificationLinks().each(function() {
        formData[this.attr('name')] = this.attr('value');
        triggerPOST(response.request.uri.href, formData)
        .then(scrapeClassification);
        //TODO add fail hadnler
    });
}


getRecordsForYear(2000);

