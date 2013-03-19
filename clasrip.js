var cheerio = require('cheerio'),
    request = require('request'),
    Q = require('q');


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


function triggerSearch(formData) {
    var deferred = Q.defer();

    request({
        url: 'http://www.classification.gov.au/Pages/Search.aspx',
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
    .then(console.log)
    .fail(console.log);
}


function getResultCount(node) {
    start = parseInt(node.find("[id*=PageStartIndexLabel]").text(), 10);
    end = parseInt(node.find("[id*=PageEndIndexLabel]").text(), 10);
    total = parseInt(node.find("[id*=TotalRowsLabel]").text(), 10);

    return [start, end, total];
}


function scrapePage(response, callback) {
    var $ = cheerio.load(response.body),
        _x = getResultCount($.root()), 
        start = _x[0], end = _x[1], total = _x[2],
        button,
        buttons = $(".ncd-results-table table input[type='submit']"),
        i, ii, query;
    
    for (i = 0, ii = buttons.length; i < ii; ++i) {
        button = $(buttons[i]);
        query = getFormData($.root(), $);
        query[button.attr('name')] = button.attr('value');
       
        // TODO GET CLASSIFICATION DATA
    }
}

getRecordsForYear(2000);

