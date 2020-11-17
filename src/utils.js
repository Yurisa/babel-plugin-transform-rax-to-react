exports.toCamelCase = function(str) {
  const newStr = str.replace(/^[a-z]/, (s) => s.toUpperCase());
  const regExp = /[-_]\w/gi;
  return newStr.replace(regExp, (match) => {
    return match.charAt(1).toUpperCase();
  });
};

