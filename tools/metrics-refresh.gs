/**
 * HIIT Co. public, read-only metrics feed. Revenue is never returned.
 * Deploy as Web app: Execute as Me; access Anyone.
 * Enable the Google Sheets advanced service (identifier Sheets, v4).
 * OAuth scope: https://www.googleapis.com/auth/spreadsheets.readonly
 * No spreadsheet writes, credentials or arbitrary file/range parameters.
 */
function doGet(e) {
  var callback = e && e.parameter && e.parameter.callback;
  if (callback && !/^hiitMetrics_[a-zA-Z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput('Invalid callback');
  }
  var result;
  try {
    var spreadsheetId = '14IEcmqu5-PClJX4zZdoY4Wg9dUkwQsr_X6a0rKJ2bD4';
    var tabs = ['24/25 Dashboard', '25/26Dashboard', '26/27Dashboard'];
    var all = [];
    tabs.forEach(function(name) {
      var range = "'" + name.replace(/'/g, "''") + "'!A1:BA40";
      var raw = Sheets.Spreadsheets.Values.get(spreadsheetId, range, {valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}).values || [];
      var formatted = Sheets.Spreadsheets.Values.get(spreadsheetId, range, {valueRenderOption:'FORMATTED_VALUE'}).values || [];
      if (!raw.length || !formatted.length) throw new Error('Missing dashboard values');
      all = all.concat(readDashboard(raw, formatted, name));
    });
    var today = Utilities.formatDate(new Date(), 'Pacific/Auckland', 'yyyy-MM-dd');
    result = buildMetricsFeed(all, today);
    result.updatedAt = new Date().toISOString();
  } catch (error) {
    result = {ok:false,error:'Unable to read the dashboard tabs. Check the script owner can access the Sheet and the expected metric labels are present.'};
  }
  var json = JSON.stringify(result).replace(/</g, '\\u003c');
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}
function readDashboard(values, displayed, source) {
  var labels = {intro:'# Intro Sales',membershipsSold:'Memberships Sold',attendance:'Attendance',
    visits:'Ave visit per member (3-4)',cancels:'Cancels MTD',churn:'Monthly Churn % (KPI - 5%)',
    autopay:'Autopay Member #',suspended:'Suspended Member #'};
  var rows = {};
  Object.keys(labels).forEach(function(key) {
    rows[key] = values.findIndex(function(row){return String(row[0] || '').trim() === labels[key];});
    if (rows[key] < 0) throw new Error('Required metric label missing');
  });
  var result = [];
  for (var c = 1; c < values[0].length; c++) {
    var dateText = String(displayed[0][c] || '').trim();
    var match = dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) continue;
    var year = Number(match[3]); if (year < 100) year += 2000;
    var date = new Date(Date.UTC(year,Number(match[2])-1,Number(match[1]),12));
    if (date.getUTCFullYear()!==year || date.getUTCMonth()+1!==Number(match[2]) || date.getUTCDate()!==Number(match[1])) continue;
    var record = {weekEnding:date.toISOString().slice(0,10),source:source};
    Object.keys(labels).forEach(function(key) {
      var value = values[rows[key]][c];
      record[key] = typeof value === 'number' && isFinite(value) ? value : null;
    });
    if (Object.keys(labels).some(function(key){return record[key] !== null;})) result.push(record);
  }
  return result;
}
function buildMetricsFeed(all, today) {
  var byDate = {};
  all.filter(function(row){return row.weekEnding<=today;}).forEach(function(row){byDate[row.weekEnding]=row;});
  var records = Object.keys(byDate).sort().map(function(date){return byDate[date];});
  var fields = ['intro','membershipsSold','attendance','visits','cancels','churn','autopay','suspended'];
  if (!records.length) return {ok:false,error:'No reported metric columns were found.'};
  var completed = records.filter(function(row){return fields.every(function(key){return typeof row[key]==='number' && isFinite(row[key]);});});
  var newestReported = records[records.length-1].weekEnding;
  var latest = records[records.length-1];
  return {ok:true,newestReported:newestReported,newestCompleted:completed.length?completed[completed.length-1].weekEnding:null,
    records:records,missingLatestFields:fields.filter(function(key){return latest[key]===null;}),
    incompleteColumnCount:records.filter(function(row){return fields.some(function(key){return row[key]===null;});}).length};

}
