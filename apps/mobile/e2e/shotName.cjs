/** Screenshot file name: actions/upload-artifact refuses " : < > | * ? \r \n (e.g. "invoice?f=all" broke the night of 10.11, #659). */
function shotFileName(name, n) {
  return `${name}-${n}.png`.replace(/[":<>|*?\r\n]/g, "_");
}
module.exports = { shotFileName };
