const fs = require('fs');
const file = 'c:/Users/ndt002-dl/Desktop/bbq-pos/server.js';
let content = fs.readFileSync(file, 'utf8');

const helper = `
function removeVietnameseTones(str) {
  if (!str) return "";
  str = String(str);
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  str = str.replace(/\\u0300|\\u0301|\\u0303|\\u0309|\\u0323/g, "");
  str = str.replace(/\\u02C6|\\u0306|\\u031B/g, "");
  return str;
}

function createSafePrinter(config) {
  const printer = new ThermalPrinter(config);
  const origPrintln = printer.println.bind(printer);
  printer.println = (text) => origPrintln(removeVietnameseTones(text));
  const origTableCustom = printer.tableCustom.bind(printer);
  printer.tableCustom = (items) => {
    const safeItems = items.map(i => ({...i, text: removeVietnameseTones(i.text)}));
    origTableCustom(safeItems);
  };
  return printer;
}
`;

content = content.replace('const customDriver = new WindowsRawDriver();', 'const customDriver = new WindowsRawDriver();\n' + helper);
content = content.replace(/new ThermalPrinter/g, 'createSafePrinter');

fs.writeFileSync(file, content);
console.log("Done");
