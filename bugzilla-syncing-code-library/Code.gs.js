/*
   TODO
   
   Improve the logic behind 'Updated' to ignore things like tracking changes
   Trends: numbers over time
*/

var isReporterExternal = function(creator_detail) {
  var email = creator_detail['email'];
  var real_name = creator_detail['real_name'];
  
  if(email.includes("@mozilla.com")) {
    return false;
  } else if(real_name.includes("[:")) {
    // If they've put an irc nick in their name, they're probably not an external reporter
    return false;
  } else if(real_name == "[:philipp]" || real_name == "Treeherder Bug Filer") {
    return false;
  }
  return true;
}
var prettyDate = function(timestamp) {
 return new Date(Date.parse(timestamp)).toDateString().substring(4); 
}
var daysOld = function(timestamp) {
 var days = Math.ceil((Date.now() - Date.parse(timestamp)) / (1000 * 60 * 60 * 24));
 return days;
}
if (!Array.prototype.fill) {
  Object.defineProperty(Array.prototype, 'fill', {
    value: function(value) {
      if (this == null) {
        throw new TypeError('this is null or not defined');
      }
      var O = Object(this);
      var len = O.length >>> 0;
      var start = arguments[1];
      var relativeStart = start >> 0;
      var k = relativeStart < 0 ?
        Math.max(len + relativeStart, 0) :
        Math.min(relativeStart, len);
      var end = arguments[2];
      var relativeEnd = end === undefined ?
        len : end >> 0;
      var final = relativeEnd < 0 ?
        Math.max(len + relativeEnd, 0) :
        Math.min(relativeEnd, len);
      while (k < final) {
        O[k] = value;
        k++;
      }
      return O;
    }
  });
}
if (!Array.prototype.includes) {
  Object.defineProperty(Array.prototype, "includes", {
    enumerable: false,
    value: function(obj) {
        var newArr = this.filter(function(el) {
          return el == obj;
        });
        return newArr.length > 0;
      }
  });
}
function chunkArray(myArray, chunk_size){
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];
    
    for (index = 0; index < arrayLength; index += chunk_size) {
        myChunk = myArray.slice(index, index+chunk_size);
        tempArray.push(myChunk);
    }

    return tempArray;
}

var Query = function(api_key, url) {
  this.api_key = api_key;
  this.url = url;
  
  this.get = function() {
    var response = UrlFetchApp.fetch(this.url + "&api_key=" + this.api_key);
    var data = JSON.parse(response);
    var bugs = data["bugs"];
    return bugs;
  }
};

var COLUMN_SORTING = "Hidden Sorting Column";
var COLUMN_ACTIVE = "In Results";
var COLUMN_ID = "ID";
var COLUMN_TYPE = "Type";
var COLUMN_TITLE = "Title";
var COLUMN_COMPONENT = "Component";
var COLUMN_STATUS = "Status";
var COLUMN_FILED = "Filed";
var COLUMN_UPDATED = "Updated";
var COLUMN_COMMENT = "Comment";
var COLUMN_SPECIAL_START = "SPECIAL_START";
var COLUMN_LASTSEENBYSCRIPT = "Last Seen By Script";

var Spreadsheet = function(url, api_key, retentionDays, columns, colorMappings, sortColumnIndex) {
  this.sheeturl = url;
  this.api_key = api_key;
  this.retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  this.colorMappings = colorMappings;
  this.spreadsheet = SpreadsheetApp.openByUrl(this.sheeturl);
  this.columnSettings = {
    'includeTitle' : !!columns.includeTitle,
    'includeEmptyType' : !!columns.includeEmptyType,
    'numCommentColumns' : !!columns.numCommentColumns ? columns.numCommentColumns : 4,
    'includeStatus' : !!columns.includeStatus,
    'additionalColumns' : !!columns.additionalColumns ? columns.additionalColumns : [],
  };
  if ( this.columnSettings.numCommentColumns < 0 ) this.columnSettings.numCommentColumns = 0;
  this.sortColumnIndexRaw = sortColumnIndex;
  
  this.getSpreadSheet = function() {
    return this.spreadsheet;
  },
  
  this.doTheNormal = function(sheetIndex, bugs) {
    Logger.log(sheetIndex + " There are " + bugs.length + " bugs to process.");

    // This should be up in the initization code above, but _columnToIndex isn't defined then.
    this.sortColumnIndex = this.sortColumnIndexRaw ? this.sortColumnIndexRaw : this._columnToIndex(COLUMN_UPDATED) - 1;

    // This is cruddy coding. We use this.sheet as a member variable we update when we call
    // this function, instead of treating it as a parameter to functions like we should.
    this.sheet = this.spreadsheet.getSheets()[sheetIndex];
    
    this.headers = [];
    this.headers = this.headers.concat([COLUMN_SORTING, COLUMN_ACTIVE, COLUMN_ID]);
    this.headers = this.headers.concat(this.columnSettings.includeEmptyType ? [COLUMN_TYPE] : []);
    this.headers = this.headers.concat(this.columnSettings.includeTitle ? [COLUMN_TITLE] : []);
    this.headers = this.headers.concat([COLUMN_COMPONENT]);
    this.headers = this.headers.concat(this.columnSettings.includeStatus ? [COLUMN_STATUS] : []);
    this.headers = this.headers.concat([COLUMN_FILED, COLUMN_UPDATED]);
    for (var i=0; i<this.columnSettings.additionalColumns.length; i++) {
      this.headers = this.headers.concat([this.columnSettings.additionalColumns[i].name]);
    }
    this.headers = this.headers.concat(Array(this.columnSettings.numCommentColumns).fill(COLUMN_COMMENT));
    this.headers = this.headers.concat([COLUMN_LASTSEENBYSCRIPT]);

    var bugIDsToIndex = {};
    for (var i=0; i<bugs.length; i++) {
      bugIDsToIndex[bugs[i]['id'].toString()] = i;
    }
    
    Logger.log(sheetIndex + " starting _setup");
    this._setup(this.headers);
    Logger.log(sheetIndex + " starting _scanCurrent");
    this._scanCurrent(bugIDsToIndex, bugs);
    Logger.log(sheetIndex + " starting _getDependentData");
    this._getDependentData(bugIDsToIndex, bugs);
    Logger.log(sheetIndex + " starting _updateExisting");
    this._updateExisting(bugs);
    Logger.log(sheetIndex + " starting _addNew");
    this._addNew(bugs);
    Logger.log(sheetIndex + " starting _markMissing");
    this._markMissing(bugIDsToIndex, bugs);
    Logger.log(sheetIndex + " starting _prune");
    this._prune();
    Logger.log(sheetIndex + " starting _sort");
    this._sort();
    Logger.log(sheetIndex + " starting _resize");
    this._resize();
    Logger.log(sheetIndex + " starting _color");
    this._color(this.colorMappings);
    Logger.log(sheetIndex + " done");
  }
  
  // Adds the header column, hides the hidden column
  this._setup = function(headers) {
    var range = this.sheet.getRange(1, this._columnToIndex(COLUMN_SORTING), 1, 1);
    if (range.getValue() != COLUMN_SORTING) {
      range = this.sheet.getRange(1, this._columnToIndex(COLUMN_SORTING), 1, headers.length);
      // Array is two dimensional (only one row)
      range.setValues([headers]);
    }
    
    var hiddenColumnLetter = String.fromCharCode("A".charCodeAt(0) + this._columnToIndex(COLUMN_SORTING) - 1);
    range = this.sheet.getRange(hiddenColumnLetter + "1");
    this.sheet.hideColumn(range);
    
    var lastSeenColumnLetter = String.fromCharCode("A".charCodeAt(0) + this._columnToIndex(COLUMN_LASTSEENBYSCRIPT) - 1);
    range = this.sheet.getRange(lastSeenColumnLetter + "1");
    this.sheet.hideColumn(range);
  }
  
  // Makes an array of currently present bugIds
  this._scanCurrent = function(bugIDsToIndex, bugs) {
    this.existingIDs = [];
    var range = this.sheet.getRange(1, this._columnToIndex(COLUMN_ID), this.sheet.getLastRow(), 1);
    var values = range.getValues();
    
    for (var i=0; i < values.length; i++) {
      if (i == 0) continue; //Skip header row
      
      if (!!values[i] && values[i].toString().trim().length > 0) {
        this.existingIDs.push(values[i].toString());

        if(values[i].toString() in bugIDsToIndex) {
          bugs[bugIDsToIndex[values[i].toString()]]['sheet_rowIndex'] = 1 + parseInt(i);
        }
      }
    }
    Logger.log("Bugs provided from bugzilla: " + bugIDsToIndex);
    Logger.log("Bugs found in the sheet: " + this.existingIDs);
  }
  
  // Collects supplemental data we will need
  this._getDependentData = function(bugIDsToIndex, bugs) {
    var idsToQuery = [];
    var fieldsToInclude = ['id'];
    var alreadyHaveIt = function(id) {
      return id in bugIDsToIndex || id in idsToQuery;
    }
    // We need to know of blocking bugs are open or closed
    var needBlockingData = false;
    var needTriageOwners = false;
    for (var i=0; i<this.columnSettings.additionalColumns.length; i++) {
      if (this.columnSettings.additionalColumns[i].type == 'special' && this.columnSettings.additionalColumns[i].special == 'blockers') {
        needBlockingData = true;
      }
      if (this.columnSettings.additionalColumns[i].type == 'special' && this.columnSettings.additionalColumns[i].special == 'triageOwner') {
        needTriageOwners = true;
      }
    }
    if (needBlockingData) {
      fieldsToInclude.push('status');
      for (var b in bugs) {
        var bug = bugs[b];
        for (var j=0; j<bug['depends_on'].length; j++) {
          if (alreadyHaveIt(bug['depends_on'][j])) {
            continue;
          }
          idsToQuery.push(bug['depends_on'][j]);
        }
      }
    }
    
    // Okay, go get the supplemental data
    var supplementalData = [];
    var supplementalDataIDsToIndex = {};
    if (idsToQuery.length != 0) {
      // Split into 250 bugs at a time to avoid making too long a URL
      var arrayChunks = chunkArray(idsToQuery, 100);
      Logger.log("Chunks: " + arrayChunks.length);
      for (var i=0; i<arrayChunks.length; i++) {
        var query = new Query(this.api_key, "https://bugzilla.mozilla.org/rest/bug?id=" + arrayChunks[i].join(",") + "&include_fields=" + fieldsToInclude.join(","));
        supplementalData = supplementalData.concat(query.get());
      }
      for (var i=0; i<supplementalData.length; i++) {
        supplementalDataIDsToIndex[supplementalData[i]['id'].toString()] = i;
      }
    }
    
    var triageData = {};
    if (needTriageOwners) {
      var response = UrlFetchApp.fetch("https://bugzilla.mozilla.org/rest/product?type=selectable&include_fields=id,name,components.name,components.triage_owner");
      var data = JSON.parse(response);
      var tmpTriageData = data["products"];
      triageData = {};
      for(var i=0;i<tmpTriageData.length;i++) {
        triageData[tmpTriageData[i]['name']] = {};
        
        for(var j=0; j<tmpTriageData[i]['components'].length; j++) {
          triageData[tmpTriageData[i]['name']][tmpTriageData[i]['components'][j]['name']] = tmpTriageData[i]['components'][j]['triage_owner'].replace("@mozilla.com", "@mco");
        }
      }
    }
      
    // Now process it
    var closed_statuses = ['RESOLVED', 'VERIFIED', 'CLOSED'];
    for (var i=0; i<bugs.length; i++) {
      var bug = bugs[i];
      
      if (needBlockingData) {
        var blockers = bug['depends_on'];
        var newBlockers = [];
        for (var j=0; j<blockers.length; j++) {
          var blocker = blockers[j];
          
          if (blocker.toString() in bugIDsToIndex && closed_statuses.includes(bugs[bugIDsToIndex[blocker.toString()]]['status'])) {
            continue;
          }
          if (blocker.toString() in supplementalDataIDsToIndex && closed_statuses.includes(supplementalData[supplementalDataIDsToIndex[blocker.toString()]]['status'])) {
            continue;
          }
          newBlockers.push(blocker);
        }
        bug['depends_on'] = newBlockers;
      }
      if (needTriageOwners) {
        for (var i=0; i<bugs.length; i++) {
          var bug = bugs[i];
          if(!(bug['product'] in triageData)) {
            Logger.log("Triage Information did not contain the product " + bug['product']);
            bug['triageOwner'] = 'ERROR';
          } else if (!(bug['component'] in triageData[bug['product']])) {
            Logger.log("Triage Information did not contain the component " + bug['component'] + " under product " + bug['product']);
            bug['triageOwner'] = 'ERROR';
          } else {
            bug['triageOwner'] = triageData[bug['product']][bug['component']];
          }
        }
      }
    }
  }
  
  // Updates the status and the last-seen column
  this._updateExisting = function(bugs) {
    var now = Date.now();
    var bugsNotFound = [];
    for (var b in bugs) {
      var bug = bugs[b];
      if (this.existingIDs.includes(bug['id'].toString())) {
        if (!('sheet_rowIndex' in bug)) {
          Logger.log("ERROR: sheet_rowIndex not in the bug object for bug id " + bug['id']);
        }
        var index = bug['sheet_rowIndex'];
        
        // Update In Results
        var range = this.sheet.getRange(index, this._columnToIndex(COLUMN_ACTIVE), 1, 1);
        range.setValue("X");
        
        // Update the last seen column
        range = this.sheet.getRange(index, this._columnToIndex(COLUMN_LASTSEENBYSCRIPT), 1, 1);
        range.setValue(now);
        
        // Update the title, component, status, filed, last touched, and custom columns
        var values = this.columnSettings.includeTitle ? [bug['summary']] : [];
        values = values.concat([bug['product'] + " : " + bug['component']])
        if (this.columnSettings.includeStatus) {
          values = values.concat([bug['status'] + " " + bug['resolution']]);
        }
        values = values.concat([daysOld(bug['creation_time']), daysOld(bug['last_change_time'])]);
        for (var i=0; i<this.columnSettings.additionalColumns.length; i++) {
          var column = this.columnSettings.additionalColumns[i];
          values = values.concat([this._getValueForCustomColumn(column, bug)]);
        }
        
        var numColumns = (this.columnSettings.includeTitle ? 1 : 0) + 1;
        numColumns += (this.columnSettings.includeStatus ? 1 : 0) + 2 + this.columnSettings.additionalColumns.length;
        var startColumn = this.columnSettings.includeTitle ? this._columnToIndex(COLUMN_TITLE) : this._columnToIndex(COLUMN_COMPONENT);

        range = this.sheet.getRange(index, startColumn, 1, numColumns);
        range.setValues([values]);
      } else {
        bugsNotFound.push(bug['id'].toString());
      }
    }
    Logger.log("Did not find the following bugs to update: " + bugsNotFound);
  }
  
  // Goes through the spreadsheet and add any bugs that are not already in
  // the spreadsheet
  this._addNew = function(bugs) {
    var bugsWeDidntAdd = [];
    for (var b in bugs) {
      var bid = bugs[b]['id'].toString();
      if (!this.existingIDs.includes(bid)) {
          this._addBug(bugs[b]);
      } else {
          bugsWeDidntAdd.push(bid);
      }
    }
    Logger.log("We did not add the following bug IDs (they should have been updated): " + bugsWeDidntAdd);
  }
  
  // Goes through the spreadsheet and marks any bugs no longer in the search
  // results as 'Resolved'
  this._markMissing = function(bugIDsToIndex, bugs) {
    // Go through all rows and see if it's in bugIDsToIndex
    var range = this.sheet.getRange(1, this._columnToIndex(COLUMN_ID), this.sheet.getLastRow(), 1);
    var values = range.getValues();
    
    for (var i=0; i < values.length; i++) {
      if (i == 0) continue; // Ignore header row
      
      if (!!values[i] && values[i].toString().trim().length > 0) {
        if (!(values[i].toString() in bugIDsToIndex)) {
          var singleCellRange = this.sheet.getRange(1+i, this._columnToIndex(COLUMN_ACTIVE), 1, 1);
          singleCellRange.setValue(" ");
        }
      }
    }
  }
  
  // Goes through the spreadsheet and removes any sufficiently old entries
  this._prune = function() {
    var range = this.sheet.getDataRange();
    var values = range.getValues();
    var now = Date.now();
    var deletedOffset = 0;
    for (var i=0; i<values.length; i++) {
      if (i == 0) {
        //Header Row
        continue;
      }
      
      var lastSeen = values[i][this._columnToIndex(COLUMN_LASTSEENBYSCRIPT)-1];
      if (now - lastSeen > this.retentionMs) {
        Logger.log("Removing row at index " + (i - deletedOffset) + " id: " + values[i][this._columnToIndex(COLUMN_ID)-1]);
        this.sheet.deleteRow((i+1) - deletedOffset);
        deletedOffset++;
      }
    }
  }
  
  // Sorts the spreadhseet by status (Active -> Inactive) and then last updated (desc)
  this._sort = function() {
    this.sheet.sort(1, true);
  }
  
  // Auto-fits certain columns
  this._resize = function() {
    // Hidden, Status, ID
    this.sheet.autoResizeColumns(this._columnToIndex(COLUMN_SORTING), 3);
    // Filed, Updated
    this.sheet.autoResizeColumns(this._columnToIndex(COLUMN_FILED), 2);
  }
  
  // Colors things
  this._color = function(mappings) {
    var range = this.sheet.getDataRange();
    var values = range.getValues();
    for (var i in values) {
      if (i == 0) {
        //Header Row
        continue;
      }
      
      // Grey for Inactive
      if (values[i][this._columnToIndex(COLUMN_ACTIVE)-1] == " ") {
        this.sheet.getRange(1+parseInt(i), this._columnToIndex(COLUMN_SORTING), 1, this.headers.length).setBackground("#C0C0C0");
      } else {
        this.sheet.getRange(1+parseInt(i), this._columnToIndex(COLUMN_SORTING), 1, this.headers.length).setBackground("#FFFFFF");

        // Status Column
        if (this.columnSettings.includeStatus && (
            values[i][this._columnToIndex(COLUMN_STATUS)-1].includes("RESOLVED ")
            ||
            values[i][this._columnToIndex(COLUMN_STATUS)-1].includes("VERIFIED "))) {
          this.sheet.getRange(1+parseInt(i), this._columnToIndex(COLUMN_STATUS), 1, 1).setBackground("#00CC66");
        }

        // Component Mappings
        for (var j in mappings) {
          if (values[i][this._columnToIndex(COLUMN_COMPONENT) - 1].includes(mappings[j][0])) {
            this.sheet.getRange(1+parseInt(i), this._columnToIndex(COLUMN_COMPONENT), 1, 1).setBackground(mappings[j][1]);
          }
        }
      }
    }
  }
  
  // ===============================================
  this._addBug = function(bug) {
    this.sheet.insertRowBefore(2);
    var range = this.sheet.getRange(2, 1, 1, this.headers.length);
    var sortColumnLetter = String.fromCharCode("A".charCodeAt(0) + this.sortColumnIndex);
    // Array is two dimensional (only one row)
    var values = [[]];  
    var sortLink = "=IF(ISNUMBER(" + sortColumnLetter + "2), 0+CONCAT(IF(B2<>\"X\", \"999\", \"0\"), " + sortColumnLetter + "2), CONCAT(IF(B2<>\"X\", \"999\", \"0\"), " + sortColumnLetter + "2))";
    values[0] = values[0].concat([sortLink, "X"]);
    values[0] = values[0].concat(['=HYPERLINK("https://bugzilla.mozilla.org/show_bug.cgi?id=' + bug['id'] + '","' + bug['id'] + '")']);
    values[0] = values[0].concat(this.columnSettings.includeEmptyType ? [""] : []);
    values[0] = values[0].concat(this.columnSettings.includeTitle ? [bug['summary']] : []);
    values[0] = values[0].concat([bug['product'] + " : " + bug['component']]);
    values[0] = values[0].concat(this.columnSettings.includeStatus ? [bug['status'] + " " + bug['resolution']] : []);
    values[0] = values[0].concat([daysOld(bug['creation_time']), daysOld(bug['last_change_time'])]);
    
    for (var i=0; i<this.columnSettings.additionalColumns.length; i++) {
      var column = this.columnSettings.additionalColumns[i];
      values[0] = values[0].concat([this._getValueForCustomColumn(column, bug)]);
    }
    
    values[0] = values[0].concat(Array(this.columnSettings.numCommentColumns).fill(""));
    values[0] = values[0].concat([Date.now()]);
    range.setValues(values);
  }
  
  // ===============================================
  this._getValueForCustomColumn = function(column, bug) {
    if (column.type == 'special') {
      if (column.special == 'blockers') {
        return bug['depends_on'].length > 0 ? "X" : " ";
      } else if (column.special == 'triageOwner') {
        return bug['triageOwner'];
      } else if (column.special == 'reporter') {
        return bug['creator_detail']['real_name'] + " (" + bug['creator_detail']['nick']  + ") " + bug['creator_detail']['email'];
      } else if (column.special == 'reporter_external') {
        return isReporterExternal(bug['creator_detail']) ? "X" : " ";
      } else if (column.special == 'assignee') {
        var assignee = 'assigned_to_detail' in bug ? bug['assigned_to_detail']['real_name'] : " ";
        return !assignee.includes("Nobody") ? assignee : " ";
      } else {
        throw "Got a special column I don't know how to handle: " + column.special;
      }
    } else if (column.type == 'datefield') {
      if (bug[column.field]) {
        return bug[column.field].replace("T", " ").replace("Z", "");
      }
      return "";
    } else if (column.type == 'field') {
      return bug[column.field];
    } else if (column.type == 'flag') {
      var result = [];
      for (var j=0; j<bug['flags'].length; j++) {
        if (bug['flags'][j]['name'].includes(column.name)) {
          result.push(bug['flags'][j]['name'] + bug['flags'][j]['status']);
        }
      }
    return result.join(", ");
    } else if (column.type == 'filter' || column.type == 'checkbox') {
      var lookFor = column.keywords;
      var result = bug['keywords'].filter(function(x) { for ( var j=0; j<lookFor.length; j++) { if (x.includes(lookFor[j])) { return true; } } } );
      for (var j=0; j<lookFor.length; j++) {
        if (bug['whiteboard'].includes(lookFor[j])) {
          result.push(lookFor[j]);
        }
      }
      
      if (column.type == 'checkbox') {
        return result.length > 0 ? "X" : " ";
      } else {
        return result.join(", ");
      }
    } else {
      throw "Got a column type I don't know how to handle: " + column.type;
    }
  }
  
  this._columnToIndex = function(columnName) {
    const columnsPostTitle = this.columnSettings.includeTitle ? 1 : 0;
    const columnsPostType = this.columnSettings.includeEmptyType ? 1 : 0;
    const columnsPostStatus = this.columnSettings.includeStatus ? 1 : 0;
    switch(columnName)
    {
      case COLUMN_SORTING:
        return 1;
      case COLUMN_ACTIVE:
        return 2;
      case COLUMN_ID:
        return 3;
      case COLUMN_TYPE:
        if (!this.columnSettings.includeEmptyType) {
          throw "You should not ask for the type column if you're not including it.";
        }
        return 4;
      case COLUMN_TITLE:
        if (!this.columnSettings.includeTitle) {
          throw "You should not ask for the title column if you're not including it.";
          }
        return 4 + columnsPostType;
      case COLUMN_COMPONENT:
        return 4 + columnsPostTitle + columnsPostType;
      case COLUMN_STATUS:
        if (!this.columnSettings.includeStatus) {
          throw "You should not ask for the status column if you're not including it.";
        }
        return 5 + columnsPostTitle + columnsPostType;
      case COLUMN_FILED:
        return 5 + columnsPostTitle + columnsPostType + columnsPostStatus;
      case COLUMN_UPDATED:
        return 6 + columnsPostTitle + columnsPostType + columnsPostStatus;
      case COLUMN_SPECIAL_START:
        return 7 + columnsPostTitle + columnsPostType + columnsPostStatus;
      case COLUMN_COMMENT:
        throw "You should not be asking for the index of the comment column";
      case COLUMN_LASTSEENBYSCRIPT:
        return 7 + columnsPostTitle + columnsPostType + columnsPostStatus + this.columnSettings.additionalColumns.length + this.columnSettings.numCommentColumns;
      default:
        throw "Got a request for a column " + columnName + " I don't know about.";
    }
  }
  
  this._colorGradiant = function(percent) {
    // Swap it around so older is red
    percent = 1 - percent;
    // Scape it to 100
    percent *= 100;
    var r, g, b = 0;
    if(percent < 50) {
        r = 255;
        g = Math.round(5.1 * percent);
    }
    else {
        g = 255;
        r = Math.round(510 - 5.10 * percent);
    }
    var h = r * 0x10000 + g * 0x100 + b * 0x1;
    return '#' + ('000000' + h.toString(16)).slice(-6);
  }
};