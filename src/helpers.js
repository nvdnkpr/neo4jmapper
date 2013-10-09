var global = (typeof window === 'object') ? window : root;

(function(){

  "use strict";

  var _ = null;

  if (typeof window === 'object') {
    _ = window._;
  } else {
    _ = require('underscore');
  }

  var _is_operator = /^\$(AND|OR|XOR|NOT|AND\$NOT|OR\$NOT)$/i;

  var sortStringAndOptionsArguments = function(string, options) {
    if (typeof string === 'object') {
      return { string: null, options: string };
    }
    return {
      string: string || null,
      options: options || {}
    }
  }

  var sortOptionsAndCallbackArguments = function(options, callback) {
    if (typeof options === 'function') {
      return { options: {}, callback: options };
    }
    return {
      options: options || {},
      callback: callback
    }
  }

  var sortStringAndCallbackArguments = function(string, callback) {
    if (typeof string === 'function') {
      callback = string;
      string = null;
    }
    return {
      callback: callback,
      string: string
    }
  }

  var getIdFromObject = function(o) {
    if ((typeof o === 'object') && (o.id))
      return o.id;
    if (!isNaN(parseInt(o)))
      return parseInt(o);
    return null;
  }

  // source: https://gist.github.com/penguinboy/762197
  var flattenObject = function(ob) {
    var toReturn = {};
    
    for (var i in ob) {
      if (!ob.hasOwnProperty(i)) continue;
      
      if ((typeof ob[i]) === 'object') {
        var flatObject = flattenObject(ob[i]);
        for (var x in flatObject) {
          if (!flatObject.hasOwnProperty(x)) continue;
          
          toReturn[i + '.' + x] = flatObject[x];
        }
      } else {
        toReturn[i] = ob[i];
      }
    }
    return toReturn;
  };

  // source: https://github.com/hughsk/flat/blob/master/index.js
  var unflattenObject = function (target, opts) {
    var opts = opts || {}
      , delimiter = opts.delimiter || '.'
      , result = {}

    if (Object.prototype.toString.call(target) !== '[object Object]') {
        return target
    }

    function getkey(key) {
        var parsedKey = parseInt(key)
        return (isNaN(parsedKey) ? key : parsedKey)
    };

    Object.keys(target).forEach(function(key) {
        var split = key.split(delimiter)
          , firstNibble
          , secondNibble
          , recipient = result

        firstNibble = getkey(split.shift())
        secondNibble = getkey(split[0])

        while (secondNibble !== undefined) {
            if (recipient[firstNibble] === undefined) {
                recipient[firstNibble] = ((typeof secondNibble === 'number') ? [] : {})
            }

            recipient = recipient[firstNibble]
            if (split.length > 0) {
                firstNibble = getkey(split.shift())
                secondNibble = getkey(split[0])
            }
        }

        // unflatten again for 'messy objects'
        recipient[firstNibble] = unflattenObject(target[key])
    });

    return result
  };

  var escapeString = function(s) {
    if (typeof s !== 'string')
      return s;
    // trim quotes if exists
    if ( (/^".+"$/.test(s)) || (/^'.+'$/.test(s)) )
      s = s.substr(1,s.length-2);
    return s.replace(/([^\\]){1}(['"])/g,'$1\\$2');
  }

  var valueToStringForCypherQuery = function(value) {
    if ((value) && (value.constructor === RegExp)) {
      value = value.toString().replace(/^\/(\^)*(.+?)\/[ig]*$/, (value.ignoreCase) ? '$1(?i)$2' : '$1$2');
      // replace `\` with `\\` to keep compatibility with Java regex
      value = value.replace(/([^\\]{1})\\([^\\]{1})/g, '$1\\\\$2');
    } else
      value = String(value);
    return value;
  }

  var cypherKeyValueToString = function(key, originalValue, identifier, conditionalParametersObject) {
    var value = originalValue;
    var s = ''; // string that will be returned
    if (typeof conditionalParametersObject !== 'object')
      conditionalParametersObject = null;
    if (typeof identifier === 'string') {
      if (/^[nmr]\./.test(key))
        // we have already an identifier
        key = key;
      else if (/[\?\!]$/.test(key))
        // we have a default statement, escape without ! or ?
        key = identifier+'.`'+key.replace(/[\?\!]$/,'')+'`'+key.substring(key.length-1)
      else
        key = identifier+'.`'+key+'`';
    }
    // this.valuesToParameters
    if (_.isRegExp(value)) {
      value = valueToStringForCypherQuery(value);
      value = ((conditionalParametersObject) && (conditionalParametersObject.valuesToParameters)) ? conditionalParametersObject.addValue(value) : "'"+value+"'";
      s = key + " =~ " + value;
    }
    else {
      // convert to string
      if ((_.isNumber(value)) || (_.isBoolean(value)))
        value = ((conditionalParametersObject) && (conditionalParametersObject.valuesToParameters)) ? conditionalParametersObject.addValue(value) : valueToStringForCypherQuery(value);
      // else escape
      else
        value = ((conditionalParametersObject) && (conditionalParametersObject.valuesToParameters)) ? conditionalParametersObject.addValue(value) : "'"+escapeString(value)+"'";
      s = key + " = " + value;
    }
    
    return s;
  }

  var extractAttributesFromCondition = function(condition, attributes) {
    if (typeof attributes === 'undefined')
      attributes = [];
    _.each(condition, function(value, key) {

      if (_.isObject(value)) {
        extractAttributesFromCondition(condition[key], attributes);
      }
      if ( (!_is_operator.test(key)) && (/^[a-zA-Z\_\-\.]+$/.test(key)) ) {
        // remove identifiers if exists
        attributes.push(key.replace(/^[nmr]{1}\./,''));
      }
    });
    return _.uniq(attributes);
  }

  /*
   * Builds a string from mongodb-like-query object
   */
  var ConditionalParameters = function ConditionalParameters(conditions, options) {

    ConditionalParameters.parameterRuleset = {
      $IN: function(value) {
        var s = '';
        if ((typeof value === 'object') && (value.length > 0)) {
          for (var i=0; i < value.length; i++) {
            value[i] = (typeof value[i] === 'string') ? "'"+escapeString(value[i])+"'" : valueToStringForCypherQuery(value[i]);
          }
          return 'IN( '+value.join(', ')+' )';
        }
        return '';
      },
      $in: function(value) { return this.$IN(value); }

    };

    ConditionalParameters.prototype.addValue = function(value) {
      if (!this.parameters)
        this.parameters = [];
      this.parameters.push(value);
      return '{_value'+(this.parametersStartCountAt + this.parameters.length - 1)+'_}';
    }

    ConditionalParameters.prototype.cypherKeyValueToString = function(key, originalValue, identifier) {
      // call cypherKeyValueToString with this object context
      return cypherKeyValueToString(key, originalValue, identifier, this);
    }

    ConditionalParameters.prototype.convert = function(condition, operator) {
      if (typeof condition === 'undefined')
        condition = this.conditions;
      var options = _.extend({}, this.defaultOptions, this.options);
      if (options.firstLevel)
        options.firstLevel = false;
      if (options.parametersStartCountAt)
        this.parametersStartCountAt = options.parametersStartCountAt;
      // TODO: if $not : [ {name: 'a'}] ~> NOT (name = a)
      if (typeof condition === 'string')
        condition = [ condition ];
      if (typeof operator === 'undefined')
        operator = this.operator; // AND
      if (typeof condition === 'object')
        for (var key in condition) {
          var value = condition[key];
          var property = null;
          if (_.isObject(condition[key])) {
            var properties = [];
            var firstKey = (_.keys(value)) ? _.keys(value)[0] : null;
            if ((firstKey)&&(_is_operator.test(firstKey))) {
              properties.push(this.convert(condition[key][firstKey], firstKey.replace(/\$/g,' ').trim().toUpperCase(), options));
            } else {
              for (var k in condition[key]) {
                // k = key/property, remove identifier e.g. n.name
                var property = k.replace(/^[nmrp]\./,'');
                value = condition[key][k];
                
                // only check for attributes if not s.th. like `n.name? = …`
                var identifierWithProperty = (/\?$/.test(property)) ? '' : property;
                if (identifierWithProperty) {
                  if (options.identifier)
                    // we have s.th. like options.identifier = n; property = '`'+identifierWithProperty+'`'
                    identifierWithProperty = options.identifier + '.`' + identifierWithProperty + '`';
                  else
                    // we have no explicit identifier, so we use the complete key/property and expecting it contains identifier
                    identifierWithProperty = k;
                }
                var hasAttribute = (identifierWithProperty) ? 'HAS ('+identifierWithProperty+') AND ' : '';
                if (value === k) {
                  properties.push(hasAttribute+value);
                // do we have s.th. like { name: { $IN: [ … ] } }
                } else if ((typeof value === 'object')&&(value !== null)&&(Object.keys(value).length === 1)&&(typeof ConditionalParameters.parameterRuleset[Object.keys(value)[0]] === 'function')) {
                  properties.push(hasAttribute+' '+(identifierWithProperty || k)+' '+ConditionalParameters.parameterRuleset[Object.keys(value)[0]](value[Object.keys(value)[0]]));
                } else {
                  properties.push(hasAttribute+this.cypherKeyValueToString(k, value, 
                    // only add an identifier if we have NOT s.th. like
                    // n.name = ''  or r.since …
                    (/^[a-zA-Z\_\-]+\./).test(k) ? null : options.identifier
                  ));
                }
              }
            }
            // merge sub conditions
            condition[key] = properties.join(' '+operator+' ');
          }
        }

      if ((condition.length === 1)&&(options.firstLevel === false)&&(/NOT/i.test(operator)))
        return operator + ' ( '+condition.join('')+' )';
      else
        return '( '+condition.join(' '+operator+' ')+' )';
    }

    ConditionalParameters.prototype.toString = function() {
      if (this.conditions)
        this._s = this.convert();
      return this._s;
    }
    
    // assign parameters and option(s)
    if (typeof conditions === 'object') {
      this.conditions = (conditions) ? conditions : {};
    } else if (typeof conditions === 'string') {
      this.conditions = null;
      this._s = '( ' + conditions + ' )';
      return;
    } else {
      throw Error('First argument must be an object with conditional parameters or a plain string');
    }
    if (typeof options === 'object') {
      this.options = options;
      // assign some options if they exists to current object
      if (typeof this.options.valuesToParameters !== 'undefined')
        this.valuesToParameters = this.options.valuesToParameters;
      if (typeof this.options.identifier !== 'undefined')
        this.identifier = this.options.identifier;
      if (typeof this.options.operator !== 'undefined')
        this.operator = this.options.operator;
    }
  }

  ConditionalParameters.prototype.operator               = 'AND';
  ConditionalParameters.prototype.identifier             = 'n';
  ConditionalParameters.prototype.conditions             = null;

  // options are used to prevent overriding object attributes on recursive calls
  ConditionalParameters.prototype.options                = null;
  ConditionalParameters.prototype.defaultOptions         = { firstLevel: true, identifier: null };

  ConditionalParameters.prototype.parameters             = null;
  ConditionalParameters.prototype.valuesToParameters     = true;
  ConditionalParameters.prototype._s                     = '';
  ConditionalParameters.prototype.parametersStartCountAt = 0;

  var constructorNameOfFunction = function(func) {
    var name = func.constructor.toString().match(/^function\s(.+?)\(/)[1];
    if (name === 'Function') {
      name = func.toString().match(/^function\s(.+)\(/)[1]
    }
    return name;
  }

  var isValidData = function(data) {
    return Boolean( (typeof data === 'object') && (data !== null) );
  }

  // source: https://gist.github.com/aredo/3001685
  var md5 = function (string) {

    function RotateLeft(lValue, iShiftBits) {
     return (lValue<<iShiftBits) | (lValue>>>(32-iShiftBits));
    }

    function AddUnsigned(lX,lY) {
      var lX4,lY4,lX8,lY8,lResult;
      lX8 = (lX & 0x80000000);
      lY8 = (lY & 0x80000000);
      lX4 = (lX & 0x40000000);
      lY4 = (lY & 0x40000000);
      lResult = (lX & 0x3FFFFFFF)+(lY & 0x3FFFFFFF);
      if (lX4 & lY4) {
        return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
      }
      if (lX4 | lY4) {
        if (lResult & 0x40000000) {
          return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
        } else {
          return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
        }
      } else {
        return (lResult ^ lX8 ^ lY8);
      }
    }

    function F(x,y,z) { return (x & y) | ((~x) & z); }
    function G(x,y,z) { return (x & z) | (y & (~z)); }
    function H(x,y,z) { return (x ^ y ^ z); }
    function I(x,y,z) { return (y ^ (x | (~z))); }

    function FF(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
    };

    function GG(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
    };

    function HH(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
    };

    function II(a,b,c,d,x,s,ac) {
      a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
      return AddUnsigned(RotateLeft(a, s), b);
    };

    function ConvertToWordArray(string) {
      var lWordCount;
      var lMessageLength = string.length;
      var lNumberOfWords_temp1=lMessageLength + 8;
      var lNumberOfWords_temp2=(lNumberOfWords_temp1-(lNumberOfWords_temp1 % 64))/64;
      var lNumberOfWords = (lNumberOfWords_temp2+1)*16;
      var lWordArray=Array(lNumberOfWords-1);
      var lBytePosition = 0;
      var lByteCount = 0;
      while ( lByteCount < lMessageLength ) {
        lWordCount = (lByteCount-(lByteCount % 4))/4;
        lBytePosition = (lByteCount % 4)*8;
        lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount)<<lBytePosition));
        lByteCount++;
      }
      lWordCount = (lByteCount-(lByteCount % 4))/4;
      lBytePosition = (lByteCount % 4)*8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80<<lBytePosition);
      lWordArray[lNumberOfWords-2] = lMessageLength<<3;
      lWordArray[lNumberOfWords-1] = lMessageLength>>>29;
      return lWordArray;
    };

    function WordToHex(lValue) {
      var WordToHexValue="",WordToHexValue_temp="",lByte,lCount;
      for (lCount = 0;lCount<=3;lCount++) {
        lByte = (lValue>>>(lCount*8)) & 255;
        WordToHexValue_temp = "0" + lByte.toString(16);
        WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length-2,2);
      }
      return WordToHexValue;
    };

    function Utf8Encode(string) {
      string = string.replace(/\r\n/g,"\n");
      var utftext = "";

      for (var n = 0; n < string.length; n++) {

        var c = string.charCodeAt(n);

        if (c < 128) {
          utftext += String.fromCharCode(c);
        }
        else if((c > 127) && (c < 2048)) {
          utftext += String.fromCharCode((c >> 6) | 192);
          utftext += String.fromCharCode((c & 63) | 128);
        }
        else {
          utftext += String.fromCharCode((c >> 12) | 224);
          utftext += String.fromCharCode(((c >> 6) & 63) | 128);
          utftext += String.fromCharCode((c & 63) | 128);
        }

      }

      return utftext;
    };

    var x=Array();
    var k,AA,BB,CC,DD,a,b,c,d;
    var S11=7, S12=12, S13=17, S14=22;
    var S21=5, S22=9 , S23=14, S24=20;
    var S31=4, S32=11, S33=16, S34=23;
    var S41=6, S42=10, S43=15, S44=21;

    string = Utf8Encode(string);

    x = ConvertToWordArray(string);

    a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;

    for (k=0;k<x.length;k+=16) {
      AA=a; BB=b; CC=c; DD=d;
      a=FF(a,b,c,d,x[k+0], S11,0xD76AA478);
      d=FF(d,a,b,c,x[k+1], S12,0xE8C7B756);
      c=FF(c,d,a,b,x[k+2], S13,0x242070DB);
      b=FF(b,c,d,a,x[k+3], S14,0xC1BDCEEE);
      a=FF(a,b,c,d,x[k+4], S11,0xF57C0FAF);
      d=FF(d,a,b,c,x[k+5], S12,0x4787C62A);
      c=FF(c,d,a,b,x[k+6], S13,0xA8304613);
      b=FF(b,c,d,a,x[k+7], S14,0xFD469501);
      a=FF(a,b,c,d,x[k+8], S11,0x698098D8);
      d=FF(d,a,b,c,x[k+9], S12,0x8B44F7AF);
      c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);
      b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
      a=FF(a,b,c,d,x[k+12],S11,0x6B901122);
      d=FF(d,a,b,c,x[k+13],S12,0xFD987193);
      c=FF(c,d,a,b,x[k+14],S13,0xA679438E);
      b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
      a=GG(a,b,c,d,x[k+1], S21,0xF61E2562);
      d=GG(d,a,b,c,x[k+6], S22,0xC040B340);
      c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);
      b=GG(b,c,d,a,x[k+0], S24,0xE9B6C7AA);
      a=GG(a,b,c,d,x[k+5], S21,0xD62F105D);
      d=GG(d,a,b,c,x[k+10],S22,0x2441453);
      c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);
      b=GG(b,c,d,a,x[k+4], S24,0xE7D3FBC8);
      a=GG(a,b,c,d,x[k+9], S21,0x21E1CDE6);
      d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);
      c=GG(c,d,a,b,x[k+3], S23,0xF4D50D87);
      b=GG(b,c,d,a,x[k+8], S24,0x455A14ED);
      a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);
      d=GG(d,a,b,c,x[k+2], S22,0xFCEFA3F8);
      c=GG(c,d,a,b,x[k+7], S23,0x676F02D9);
      b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
      a=HH(a,b,c,d,x[k+5], S31,0xFFFA3942);
      d=HH(d,a,b,c,x[k+8], S32,0x8771F681);
      c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);
      b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
      a=HH(a,b,c,d,x[k+1], S31,0xA4BEEA44);
      d=HH(d,a,b,c,x[k+4], S32,0x4BDECFA9);
      c=HH(c,d,a,b,x[k+7], S33,0xF6BB4B60);
      b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
      a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);
      d=HH(d,a,b,c,x[k+0], S32,0xEAA127FA);
      c=HH(c,d,a,b,x[k+3], S33,0xD4EF3085);
      b=HH(b,c,d,a,x[k+6], S34,0x4881D05);
      a=HH(a,b,c,d,x[k+9], S31,0xD9D4D039);
      d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);
      c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);
      b=HH(b,c,d,a,x[k+2], S34,0xC4AC5665);
      a=II(a,b,c,d,x[k+0], S41,0xF4292244);
      d=II(d,a,b,c,x[k+7], S42,0x432AFF97);
      c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);
      b=II(b,c,d,a,x[k+5], S44,0xFC93A039);
      a=II(a,b,c,d,x[k+12],S41,0x655B59C3);
      d=II(d,a,b,c,x[k+3], S42,0x8F0CCC92);
      c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);
      b=II(b,c,d,a,x[k+1], S44,0x85845DD1);
      a=II(a,b,c,d,x[k+8], S41,0x6FA87E4F);
      d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);
      c=II(c,d,a,b,x[k+6], S43,0xA3014314);
      b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
      a=II(a,b,c,d,x[k+4], S41,0xF7537E82);
      d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);
      c=II(c,d,a,b,x[k+2], S43,0x2AD7D2BB);
      b=II(b,c,d,a,x[k+9], S44,0xEB86D391);
      a=AddUnsigned(a,AA);
      b=AddUnsigned(b,BB);
      c=AddUnsigned(c,CC);
      d=AddUnsigned(d,DD);
    }

    var temp = WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d);

    return temp.toLowerCase();
  }

  return global.Neo4jMapper.helpers = {
    sortStringAndOptionsArguments: sortStringAndOptionsArguments,
    sortOptionsAndCallbackArguments: sortOptionsAndCallbackArguments,
    sortStringAndCallbackArguments: sortStringAndCallbackArguments,
    flattenObject: flattenObject,
    unflattenObject: unflattenObject,
    ConditionalParameters: ConditionalParameters,
    extractAttributesFromCondition: extractAttributesFromCondition,
    getIdFromObject: getIdFromObject,
    escapeString: escapeString,
    constructorNameOfFunction: constructorNameOfFunction,
    cypherKeyValueToString: cypherKeyValueToString,
    valueToStringForCypherQuery: valueToStringForCypherQuery,
    isValidData: isValidData,
    md5: md5
  };

})();

if (typeof window !== 'object') {
  module.exports = exports = global.Neo4jMapper.helpers;
}
