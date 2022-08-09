// This API key comes from Tom's Account. If you're not Tom and you can see it
// please email tom@mozilla.com and say that this
// API key has been exposed.
var API_KEY = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXx";

function run() {
  var query = new BSync.Query(API_KEY, "https://bugzilla.mozilla.org/rest/bug?XXX=XXX" + 
                          "&o1=substring&v1=sec-bounty%3F&f1=flagtypes.name");
  var bugs = query.get();
  
  
  var columnSettings = {
    'includeEmptyType' : true,
    'includeTitle' : true,
    'numCommentColumns' : 4,
    'includeStatus' : true,
    'additionalColumns' : [
          {'type':'filter', 'name':'Severity', 'keywords':['sec-critical', 'sec-high', 'sec-moderate', 'sec-low', 'sec-want', 'sec-other', 'sec-vector', 'sec-audit']},
    ]
    };
  var componentColors = [
      ["Thunderbird", "#FFB2B2"], // light red

      ["Pocket : iOS client", "#ffff98"], // light yellow - needs to go before pocket
      ["Pocket : Android client", "#ffff98"], // light yellow - needs to go before pocket
      ["Pocket", "#82D1DD"],  //tealish

      ["support.mozilla.org", "#98FF98"], //light green
      ["Infrastructure & Operations :", "#98FF98"], //light green
      ["Cloud Services : ", "#98FF98"], //light green
      ["bugzilla.mozilla.org : ", "#98FF98"], //light green
      ["Websites :", "#98FF98"], //light green
      ["Data Platform and Tools", "#98FF98"], //light green

      ["Firefox for iOS : Reader View", "#ffff98"], // light yellow
      ["Focus : Security: Android", "#ffff98"], // light yellow
      ["Fenix : Security: Android", "#ffff98"], // light yellow
      ["GeckoView : General", "#ffff98"], // light yellow
      ["Firefox for iOS : General", "#ffff98"], // light yellow
      ["Mozilla VPN", "#FEE68E"]
    ];
  var sheet = new BSync.Spreadsheet(
    "https://docs.google.com/spreadsheets/d/1j2dV8sS_4sDokKR-p36JUvEz92068nqebbvx8iPla6I/edit", API_KEY,
    20, columnSettings,  componentColors);

  sheet.doTheNormal(0, bugs);
}