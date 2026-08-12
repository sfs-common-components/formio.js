/* eslint-disable semi */
/* eslint-disable quotes */
/* eslint-disable no-multiple-empty-lines */
/* eslint-disable no-trailing-spaces */
/* eslint-disable space-before-function-paren */
/* eslint-disable brace-style */
/* eslint-disable eqeqeq */
/* eslint-disable no-redeclare */
/* eslint-disable block-scoped-var */
/* global $ */

import _ from 'lodash';
import fetchPonyfill from 'fetch-ponyfill';
import jsonLogic from 'json-logic-js';
import moment from 'moment-timezone/moment-timezone';
import jtz from 'jstimezonedetect';
import { lodashOperators } from './jsonlogic/operators';
import NativePromise from 'native-promise-only';
import dompurify from 'dompurify';
import { getValue } from './formUtils';
import Evaluator from './Evaluator';
const interpolate = Evaluator.interpolate;
const { fetch } = fetchPonyfill({
  Promise: NativePromise
});

export * from './formUtils';

// Configure JsonLogic
lodashOperators.forEach((name) => jsonLogic.add_operation(`_${name}`, _[name]));

// Retrieve Any Date
jsonLogic.add_operation('getDate', (date) => {
  return moment(date).toISOString();
});

// Set Relative Minimum Date
jsonLogic.add_operation('relativeMinDate', (relativeMinDate) => {
  return moment().subtract(relativeMinDate, 'days').toISOString();
});

// Set Relative Maximum Date
jsonLogic.add_operation('relativeMaxDate', (relativeMaxDate) => {
  return moment().add(relativeMaxDate, 'days').toISOString();
});

export { jsonLogic, moment };

function setPathToComponentAndPerentSchema(component) {
  component.path = getComponentPath(component);
  const dataParent = getDataParentComponent(component);
  if (dataParent && typeof dataParent === 'object') {
    dataParent.path = getComponentPath(dataParent);
  }
}

/**
 * Evaluate a method.
 *
 * @param func
 * @param args
 * @return {*}
 */
export function evaluate(func, args, ret, tokenize) {
  let returnVal = null;
  const component = args.component ? args.component : { key: 'unknown' };
  if (!args.form && args.instance) {
    args.form = _.get(args.instance, 'root._form', {});
  }
  if (func?.toString().includes('form')) {
    args.form = _.cloneDeep(args.form);
  }
  else {
    delete args.form;
  }
  const componentKey = component.key;

  if (typeof func === 'string') {
    if (ret) {
      func += `;return ${ret}`;
    }

    if (tokenize) {
      // Replace all {{ }} references with actual data.
      func = func.replace(/({{\s+(.*)\s+}})/, (match, $1, $2) => {
        if ($2.indexOf('data.') === 0) {
          return _.get(args.data, $2.replace('data.', ''));
        }
        else if ($2.indexOf('row.') === 0) {
          return _.get(args.row, $2.replace('row.', ''));
        }

        // Support legacy...
        return _.get(args.data, $2);
      });
    }
    try {
      func = Evaluator.evaluator(func, args);
      args = _.values(args);
    }
    catch (err) {
      console.warn(`An error occured within the custom function for ${componentKey}`, err);
      returnVal = null;
      func = false;
    }
  }

  if (typeof func === 'function') {
    try {
      returnVal = Evaluator.evaluate(func, args);
    }
    catch (err) {
      returnVal = null;
      console.warn(`An error occured within custom function for ${componentKey}`, err);
    }
  }
  else if (typeof func === 'object') {
    try {
      returnVal = jsonLogic.apply(func, args);
    }
    catch (err) {
      returnVal = null;
      console.warn(`An error occured within custom function for ${componentKey}`, err);
    }
  }
  else if (func) {
    console.warn(`Unknown function type for ${componentKey}`);
  }
  return returnVal;
}

export function getRandomComponentId() {
  return `e${Math.random().toString(36).substring(7)}`;
}

/**
 * Get a property value of an element.
 *
 * @param style
 * @param prop
 * @return {number}
 */
export function getPropertyValue(style, prop) {
  let value = style.getPropertyValue(prop);
  value = value ? value.replace(/[^0-9.]/g, '') : '0';
  return parseFloat(value);
}

/**
 * Get an elements bounding rectagle.
 *
 * @param element
 * @return {{x: string, y: string, width: string, height: string}}
 */
export function getElementRect(element) {
  const style = window.getComputedStyle(element, null);
  return {
    x: getPropertyValue(style, 'left'),
    y: getPropertyValue(style, 'top'),
    width: getPropertyValue(style, 'width'),
    height: getPropertyValue(style, 'height')
  };
}

/**
 * Determines the boolean value of a setting.
 *
 * @param value
 * @return {boolean}
 */
export function boolValue(value) {
  if (_.isBoolean(value)) {
    return value;
  }
  else if (_.isString(value)) {
    return (value.toLowerCase() === 'true');
  }
  else {
    return !!value;
  }
}

/**
 * Check to see if an ID is a mongoID.
 * @param text
 * @return {Array|{index: number, input: string}|Boolean|*}
 */
export function isMongoId(text) {
  return text.toString().match(/^[0-9a-fA-F]{24}$/);
}

/**
 * Checks the calculated value for a provided component and data.
 *
 * @param {Object} component
 *   The component to check for the calculated value.
 * @param {Object} submission
 *   A submission object.
 * @param data
 *   The full submission data.
 */
export function checkCalculated(component, submission, rowData) {
  // Process calculated value stuff if present.
  if (component.calculateValue) {
    _.set(rowData, component.key, evaluate(component.calculateValue, {
      value: undefined,
      data: submission ? submission.data : rowData,
      row: rowData,
      util: this,
      component
    }, 'value'));
  }
}

/**
 * Check if a simple conditional evaluates to true.
 *
 * @param condition
 * @param condition
 * @param row
 * @param data
 * @returns {boolean}
 */
export function checkSimpleConditional(component, condition, row, data) {
  let value = null;
  if (row) {
    value = getValue({ data: row }, condition.when);
  }
  if (data && _.isNil(value)) {
    value = getValue({ data }, condition.when);
  }
  // FOR-400 - Fix issue where falsey values were being evaluated as show=true
  if (_.isNil(value)) {
    value = '';
  }

  const eq = String(condition.eq);
  const show = String(condition.show);

  // Special check for selectboxes component.
  if (_.isObject(value) && _.has(value, condition.eq)) {
    return String(value[condition.eq]) === show;
  }
  // FOR-179 - Check for multiple values.
  if (Array.isArray(value) && value.map(String).includes(eq)) {
    return show === 'true';
  }

  return (String(value) === eq) === (show === 'true');
}

/**
 * Check custom javascript conditional.
 *
 * @param component
 * @param custom
 * @param row
 * @param data
 * @returns {*}
 */
const formatTime = (time) => moment(moment(time).format('HH:mm'), 'HH:mm');
export const calculateValEvalSafeConstants = (calStr, extra) => {
	try {
		const fn = Function('_', 'moment', 'extra', `${calStr};return value;`);
		const result = fn(_, moment, extra);
		return result;
	} catch (error) {
		console.error('er---', error);
		return '';
	}
};
export function convertString(inputString) {
	try {
		const strArr = inputString.split(/[[|.]/);
		let finalStr = '';
		strArr.map((part) => {
			const childStr = part.replace(/'|]/g, '');
			if (childStr) {
				if (isNaN(childStr)) finalStr = `${finalStr}['${childStr}']`;
				else finalStr = `${finalStr}[${childStr}]`;
			}
		});

		return finalStr;
	} catch (error) {
		return '';
	}
}
export const evalSafe = (code, row = {}, data = {}) => {
	try {
		const r = row;
		const d = data;
		const fn = Function('moment', 'data', 'row', 'r', 'd', code);
		const output = fn(moment, data, row, r, d);
		return output;
	} catch (error) {
		console.error('error------', error, code);
	}
};
export const methods = {
	_MULTIPLY: (...args) => {
		let multiply = 1;
		let count = 0;
		if (typeof args[0] != 'object') {
			for (var i in args) {
				//'if(!isNaN(Number(args[i]))){
				if (args[i] !== '') {
					count++;
					multiply = multiply * Number(args[i]);
				}
			}
		} else {
			const dataArray = args[0];
			for (var i in dataArray) {
				for (let argIndex = 1; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					if (dataArray[i][colEleId] != '' && !isNaN(dataArray[i][colEleId])) {
						count++;
						multiply = multiply * Number(dataArray[i][colEleId]);
					}
				}
			}
		}
		if (count >= 1) {
			return multiply;
		} else {
			return '';
		}
	},
	_MINUS: (...args) => {
		const num1 = args[0];
		const num2 = args[1];
		// 'if(isNaN(num1)){
		// 'num1 = 0
		// '}
		// 'if(isNaN(num2)){
		// 'num2 = 0
		// '}
		// 'minus = num1 - num2;
		// 'return minus;

		if (num1 === '' || num2 === '') {
			return '';
		}
		return Number(num1) - Number(num2);
	},
	_COUNT: (...args) => {
		let count = '';
		if (typeof args[0] != 'object') {
			for (var i in args) {
				//'if(!isNaN(args[i])){
				if (args[i] !== '' && !isNaN(args[i])) {
					count = Number(count) + 1;
				}
			}
		} else {
			const dataArray = args[0];
			for (var i in dataArray) {
				for (let argIndex = 1; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					if (dataArray[i][colEleId] != '' && !isNaN(dataArray[i][colEleId])) {
						count = Number(count) + 1;
					}
				}
			}
		}
		return count;
	},
	_SUM: (...args) => {
		//(`value = _SUM(d.dataGrid,'r.number')+_SUM(d.dataGrid1,'r.number')`)
		let sum = 0;
		let count = 0;
		if (typeof args[0] != 'object') {
			for (var i in args) {
				//'if(!isNaN(Number(args[i]))){
				if (args[i] !== '' && !isNaN(Number(args[i]))) {
					sum += Number(args[i]);
					count += 1;
				}
			}
		} else {
			const dataArray = args[0];
			for (var i in dataArray) {
				for (let argIndex = 1; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					if (!isNaN(dataArray[i][colEleId])) {
						count += 1;
						sum += Number(dataArray[i][colEleId]);
					}
				}
			}
		}
		if (count > 0) {
			return sum;
		} else {
			return '';
		}
	},
	_PERCENTAGE: (...args) => {
		const num1 = args[0];
		const num2 = args[1];
		const percentage = (num1 / num2) * 100;
		if (isFinite(percentage)) {
			return percentage;
		} else {
			return '';
		}
	},
	_DIVIDE: (...args) => {
		const num1 = args[0];
		const num2 = args[1];
		const divide = Number(num1) / Number(num2);
		if (isFinite(divide)) {
			return divide;
		} else {
			return '';
		}
	},
	_displaySelect: (...args) => {
		let str = '';
		try {
			const selectedArrayOrObj = args[0];
			const propertyName = args[1];
			if (selectedArrayOrObj && propertyName) {
				if (selectedArrayOrObj.length >= 0) {
					selectedArrayOrObj.forEach((obj) => {
						if (obj) {
							str +=
								obj[propertyName] !== ''
									? selectedArrayOrObj.length > 1 && obj != selectedArrayOrObj[0]
										? `,${  obj[propertyName]}`
										: obj[propertyName]
									: obj[propertyName];
						}
					});
				} else {
					//we have to convert this string ['countryOfOrigin[0].name'](propertyName) to ['countryOfOrigin'][0]['name'] otherwise we ll not be able to access to value it will check the key of that particular string,use convertString method to do so..
					if (
						selectedArrayOrObj &&
						calculateValEvalSafeConstants(`value= extra.selectedArrayOrObj${convertString(propertyName)}`, {
							selectedArrayOrObj,
						})
					) {
						str = calculateValEvalSafeConstants(`value =extra.selectedArrayOrObj${convertString(propertyName)}`, {
							selectedArrayOrObj,
						});
					} 
				}
			}
			return str;
		} catch (error) {
			console.error('err-r-r--r', error);
		}
		return str;
	},
	//have doubt on it..
	getMean: (data) => {
		if (data.length === 0) return 0; //when data is empty then return 0
		return (
			data.reduce(function (a, b) {
				return Number(a) + Number(b);
			}) / data.length
		);
	},
	_EQ: (...args) => {
		let eq = false;
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1])) return;
		eq = args[0] == args[1];
		return eq;
	},
	_NE: (...args) => {
		let ne = false;
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1])) return;
		ne = args[0] != args[1];
		return ne;
	},
	_LT: (...args) => {
		let lt = false;
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1])) return;
		lt = Number(args[0]) < Number(args[1]);
		return lt;
	},
	_IF: (...args) => {
		let _if = '';
		if (methods._ISEMPTY(args[2])) {
			args[2] = false;
		}
		if (methods._ISEMPTY(args[1])) {
			args[1] = true;
		}
		_if = args[0] ? args[1] : args[2];
		return _if;
	},
	_STDEV: (...args) => {
		const data = [];
		if (typeof args[0] != 'object') {
			for (const i in args) {
				if (!isNaN(args[i])) {
					data.push(args[i]);
				}
			}
		} else {
			const dataArray = args[0];
			for (const i in dataArray) {
				for (let argIndex = 1; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					const val = dataArray[i][colEleId];
					if (!isNaN(val)) {
						data.push(val);
					}
				}
			}
		}
		const m = methods.getMean(data);
		return Math.sqrt(
			data.reduce(function (sq, n) {
				return sq + Math.pow(n - m, 2);
			}, 0) /
				(data.length - 1)
		);
	},
	_AVERAGE: (...args) => {
		let sum = 0;
		let average = 0;
		if (typeof args[0] != 'object') {
			for (var i in args) {
				if (!isNaN(Number(args[i]))) {
					sum += Number(args[i]);
				}
			}
			average = sum / args.length;
		} else {
			const dataArray = args[0];
			let count = 0;
			for (var i in dataArray) {
				for (let argIndex = 1; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					if (!isNaN(dataArray[i][colEleId])) {
						sum += Number(dataArray[i][colEleId]);
						count++;
					}
				}
			}
			average = sum / count;
		}
		if (!isNaN(average)) {
			return average;
		}
		return 0;
	},
	//need to check again
	_AVERAGEIF: (...args) => {
		let count = 0;
		let condition = args[1];
		let sum = 0;
		let avg = 0;
		if (typeof args[0] != 'object') {
			condition = `${args[0]} ${args[1]}`;
			for (let i = 2; i < args.length; i++) {
				const val = args[i];
				if (!isNaN(val) && calculateValEvalSafeConstants(`let val= ${val}; value= ${val} ${condition}`, {})) {
					count += 1;
					sum += Number(val);
				}
			}
		} else {
			const dataArray = args[0];
			condition = `${args[1]} ${args[2]}`;
			for (var i in dataArray) {
				for (let argIndex = 3; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					const val = dataArray[i][colEleId];
					if (
						!isNaN(val) &&
						calculateValEvalSafeConstants(`let val= ${val}; value= ${val} ${condition}`, {
							val: val,
							condition: condition,
						})
					) {
						count += 1;
						sum += Number(val);
					}
				}
			}
		}
		avg = sum / count;
		if (isNaN(avg)) {
			return 0;
		}
		return avg;
	},
	_SUMIF(...args) {
		let sum = 0;
		let condition = args[1];
		if (typeof args[0] != 'object') {
			condition = `${args[0]} ${args[1]}`;
			for (let i = 2; i < args.length; i++) {
				const val = args[i];
				if (!isNaN(val) && calculateValEvalSafeConstants(`let val= ${val}; value= ${val} ${condition}`, {})) {
					sum += Number(val);
				}
			}
		} else {
			const dataArray = args[0];
			condition = `${args[1]} ${args[2]}`;
			for (var i in dataArray) {
				for (let argIndex = 3; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					const val = dataArray[i][colEleId];
					if (!isNaN(val) && calculateValEvalSafeConstants(`let val= ${val}; value= ${val} ${condition}`, {})) {
						sum += Number(val);
					}
				}
			}
		}
		return sum;
	},
	_COUNTIF: (...args) => {
		let count = 0;
		if (typeof args[0] != 'object') {
			const comparisonValue = isNaN(args[1]) ? `'${args[1]}'` : args[1];
			const condition = `${args[0]} ${comparisonValue}`;
			for (let i = 2; i < args.length; i++) {
				let val = args[i];
				if (isNaN(val) && !methods._ISEMPTY(val)) val = `'${val}'`;
				if (!methods._ISEMPTY(val) && calculateValEvalSafeConstants(`let val= ${val}; value= ${val} ${condition}`, {})) {
					count += 1;
				}
			}
		} else {
			const comparisonValue = isNaN(args[2]) ? `'${args[2]}'` : args[2];
			const condition = `${args[1]} ${comparisonValue}`;
			const dataArray = args[0];
			// let count = 0;
			for (var i in dataArray) {
				for (let argIndex = 3; argIndex < args.length; argIndex++) {
					let colEleId = args[argIndex].replace('row.', '');
					colEleId = colEleId.replace('r.', '');
					let val = dataArray[i][colEleId];
					if (isNaN(val) && !methods._ISEMPTY(val)) val = `'${val}'`;
					if (
						!methods._ISEMPTY(val) &&
						calculateValEvalSafeConstants(`let val= ${val}; value= ${val} ${condition}`, {})
					) {
						count += 1;
					}
				}
			}
		}
		return count;
	},
	_LTE: (...args) => {
		let lte = false;
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1])) return;
		lte = Number(args[0]) <= Number(args[1]);
		return lte;
	},
	_GT: (...args) => {
		let gt = false;
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1])) return;
		gt = Number(args[0]) > Number(args[1]);
		return gt;
	},
	_GTE: (...args) => {
		let gte = false;
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1])) return;
		gte = Number(args[0]) >= Number(args[1]);
		return gte;
	},
	_AND: (...args) => {
		let res = false;
		for (let i = 0; i < args.length; i++) {
			if (args[i]) {
				res = true;
			} else {
				res = false;
				break;
			}
		}
		return res;
	},
	_OR: (...args) => {
		let res = false;
		for (let i = 0; i < args.length; i++) {
			if (args[i]) {
				res = true;
				break;
			} else {
				res = false;
			}
		}
		return res;
	},

	_NOT: (...args) => {
		return !args[0];
	},

	_DataGridOR: (...args) => {
		const dataArray = args[0];
		const condition = args[1];
		const value = args[2];
		const keys = args.slice(3); // Extract keys

		if (!Array.isArray(dataArray)) {
			throw new Error('First argument must be an array (dataGrid)');
		}
		// Determine if value is an expression or a literal
		let formattedValue;
		if (typeof value === 'string' && isNaN(value) && !/^["'`].*["'`]$/.test(value)) {
			// If value is a string and NOT enclosed in quotes, treat it as an expression or a field reference
			formattedValue = `"${value}"`;
		} else {
			// If value is a string literal, number, or boolean, use JSON.stringify for proper formatting
			formattedValue = JSON.stringify(value);
		}
		// Determine whether the condition involves negation
		const isNegation = condition.startsWith('!'); // Check for '!' negation

		for (const row of dataArray) {
			for (let key of keys) {
				key = key.replace('r.', '').replace('row.', '');
				let code;

				// Handle special conditions like 'includes' and 'isEmpty'
				if (condition === 'includes' || (isNegation && condition.slice(1) === 'includes')) {
					code = `r.${key}.includes(${formattedValue})`;
					if (isNegation) {
						code = `!(${code})`; // Negate the result
					}
				} else if (condition === 'isEmpty' || (isNegation && condition.slice(1) === 'isEmpty')) {
					code = methods._ISEMPTY(row[key]);
					if (isNegation) {
						code = !code; // Negate the result
					}
				} else {
					// For other conditions like ===, !==, >, <, etc.
					code = `r.${key} ${condition} ${formattedValue}`;
				}
				if (evalSafe(`return ${code}`, row, {})) {
					return true; // If any key in any row satisfies, return true
				}
			}
		}

		return false; // Return false only if no key in any row satisfies the condition
	},

	_DataGridAND: (...args) => {
		const dataArray = args[0];
		const condition = args[1];
		const value = args[2];
		const keys = args.slice(3); // Extract keys

		if (!Array.isArray(dataArray)) {
			throw new Error('First argument must be an array (dataGrid)');
		}
		// Determine if value is an expression or a literal
		let formattedValue;
		if (typeof value === 'string' && isNaN(value) && !/^["'`].*["'`]$/.test(value)) {
			// If value is a string and NOT enclosed in quotes, treat it as an expression or a field reference
			formattedValue = `"${value}"`;
		} else {
			// If value is a string literal, number, or boolean, use JSON.stringify for proper formatting
			formattedValue = JSON.stringify(value);
		}
		// Determine whether the condition involves negation
		const isNegation = condition.startsWith('!'); // Check for '!' negation

		for (const row of dataArray) {
			for (let key of keys) {
				let code;
				key = key.replace('r.', '').replace('row.', '');

				// Handle special conditions like 'includes' and 'isEmpty'
				if (condition === 'includes' || (isNegation && condition.slice(1) === 'includes')) {
					code = `r.${key}.includes(${formattedValue})`;
					if (isNegation) {
						code = `!(${code})`; // Negate the result
					}
				} else if (condition === 'isEmpty' || (isNegation && condition.slice(1) === 'isEmpty')) {
					code = methods._ISEMPTY(row[key]);
					if (isNegation) {
						code = !code; // Negate the result
					}
				} else {
					// For other conditions like ===, !==, >, <, etc.
					code = `r.${key} ${condition} ${formattedValue}`;
				}
				if (!evalSafe(`return ${code}`, row, {})) {
					return false; // If any key fails for any row, return false
				}
			}
		}

		return true; // Only return true if all rows meet the condition
	},

	_BETWEEN: (...args) => {
		if (args.length > 2) {
			if (Number(args[0]) >= Number(args[1]) && Number(args[0]) <= Number(args[2])) {
				return true;
			}
		}
		return false;
	},

	_NOTBETWEEN: (...args) => {
		if (methods._ISEMPTY(args[0]) || methods._ISEMPTY(args[1]) || methods._ISEMPTY(args[2])) return false;
		if (args.length > 2) {
			if (Number(args[0]) < Number(args[1]) || Number(args[0]) > Number(args[2])) {
				return true;
			}
		}
		return false;
	},
	
	_ISEMPTY: (...args) => {
		return args[0] === '' || args[0] === null || args[0] === undefined || (_.isObject(args[0]) && _.isEmpty(args[0]));
	},

	// _getValuesFromDatagrid: (...args) => {
	// 	let values = [];
	// 	let dataArray = args[0];
	// 	for (var i in dataArray) {
	// 		for (let argIndex = 1; argIndex < args.length; argIndex++) {
	// 			let colEleId = args[argIndex].replace('row.', '');
	// 			colEleId = colEleId.replace('r.', '');
	// 			values.push(dataArray[i][colEleId]);
	// 		}
	// 	}
	// 	return values;
	// },
	_getValuesFromDatagrid: (...args) => {
		const values = [];
		const dataArray = args[0];

		const getNestedValue = (obj, path) => {
			return path.split('.').reduce((acc, part) => acc && acc[part], obj);
		};
		for (let i = 0; i < dataArray.length; i++) {
			for (let argIndex = 1; argIndex < args.length; argIndex++) {
				const colEleId = args[argIndex].replace('row.', '').replace('r.', '');
				const value = getNestedValue(dataArray[i], colEleId);
				values.push(value);
			}
		}
		return values;
	},

	_ANDComparision: (...args) => {
		const [firstArray, method, second, extra] = args;

		// if (typeof second !== 'object') {
			for (const val of firstArray) {
				let result = false;

				switch (method) {
					case 'includes':
						result = val?.includes?.(second);
						break;
					case '!includes':
						result = !val?.includes?.(second);
						break;
					case 'startsWith':
						result = extra ? val?.[extra]?.startsWith?.(second) : val?.startsWith?.(second);
						break;
					case 'endsWith':
						result = extra ? val?.[extra]?.endsWith?.(second) : val?.endsWith?.(second);
						break;
					case 'isEmpty':
						result = methods._ISEMPTY(val);
						break;
					case '!isEmpty':
						result = !methods._ISEMPTY(val);
						break;
					case 'EQ':
						if (extra === 'selectboxes') {
							result = val?.[second] === true;
						} else if (extra === 'select') {
							result = methods._EQ(val?.Name || val?.name, second);
						} else if (extra) {
							result = methods._EQ(val?.[extra], second);
						} else {
							result = methods._EQ(val, second);
						}
						break;
					case 'NE':
						if (extra === 'selectboxes') {
							result = val?.[second] !== true;
						} else if (extra === 'select') {
							result = methods._NE(val?.Name || val?.name, second);
						} else if (extra) {
							result = methods._NE(val?.[extra], second);
						} else {
							result = methods._NE(val, second);
						}
						break;
					case 'BETWEEN':
					case 'NOTBETWEEN':
					case 'TimeIsBetween':
					case 'DateIsBetween':
					case 'DateIsNotBetween':
					case 'DateTimeIsBetween':
					case 'DateTimeIsNotBetween':
					case 'TimeIsNotBetween':
						result = methods[`_${method}`](val, second, extra);
						break;
					case 'IsPreviousDay':
					case 'IsNextDay':
					case 'IsCurrentDay':
					case 'IsPreviousWeek':
					case 'IsCurrentWeek':
					case 'IsNextWeek':
					case 'IsPreviousMonth':
					case 'IsCurrentMonth':
					case 'IsNextMonth':
					case 'IsPreviousYear':
					case 'IsCurrentYear':
					case 'IsNextYear':
					case 'IsPast':
					case 'IsFuture':
					case 'DateTimeIsPast':
					case 'DateTimeIsFuture':
						result = methods[`_${method}`](val);
						break;
					case '!IsOfSelectedDate':
						result = !methods._IsOfSelectedDate(val, second);
						break;
					case 'isEmptySelectBox':
						result = methods._isEmptySelectBox(val);
						break;
					case '!isEmptySelectBox':
						result = !methods._isEmptySelectBox(val);
						break;
					case 'IsPreviousDayBefore':
						result = methods._IsPreviousDay(val) && methods._TimeIsBefore(val, second);
						break;
					case 'IsPreviousDayAfter':
						result = methods._IsPreviousDay(val) && methods._TimeIsAfter(val, second);
						break;
					case 'IsPreviousDayAt':
						result = methods._IsPreviousDay(val) && methods._TimeIsSame(val, second);
						break;
					case 'IsPreviousDayNotAt':
						result = methods._IsPreviousDay(val) && methods._TimeIsNotSame(val, second);
						break;
					case 'IsCurrentDayBefore':
						result = methods._IsCurrentDay(val) && methods._TimeIsBefore(val, second);
						break;
					case 'IsCurrentDayAfter':
						result = methods._IsCurrentDay(val) && methods._TimeIsAfter(val, second);
						break;
					case 'IsCurrentDayAt':
						result = methods._IsCurrentDay(val) && methods._TimeIsSame(val, second);
						break;
					case 'IsCurrentDayNotAt':
						result = methods._IsCurrentDay(val) && methods._TimeIsNotSame(val, second);
						break;
					case 'IsNextDayBefore':
						result = methods._IsNextDay(val) && methods._TimeIsBefore(val, second);
						break;
					case 'IsNextDayAfter':
						result = methods._IsNextDay(val) && methods._TimeIsAfter(val, second);
						break;
					case 'IsNextDayAt':
						result = methods._IsNextDay(val) && methods._TimeIsSame(val, second);
						break;
					case 'IsNextDayNotAt':
						result = methods._IsNextDay(val) && methods._TimeIsNotSame(val, second);
						break;
					case 'IsPreviousDayBetween':
						result = methods._IsPreviousDay(val) && methods._TimeIsBetween(val, second, extra);
						break;
					case 'IsPreviousDayNotBetween':
						result = methods._IsPreviousDay(val) && methods._TimeIsNotBetween(val, second, extra);
						break;
					case 'IsCurrentDayBetween':
						result = methods._IsCurrentDay(val) && methods._TimeIsBetween(val, second, extra);
						break;
					case 'IsCurrentDayNotBetween':
						result = methods._IsCurrentDay(val) && methods._TimeIsNotBetween(val, second, extra);
						break;
					case 'IsNextDayBetween':
						result = methods._IsNextDay(val) && methods._TimeIsBetween(val, second, extra);
						break;
					case 'IsNextDayNotBetween':
						result = methods._IsNextDay(val) && methods._TimeIsNotBetween(val, second, extra);
						break;
					default:
						result = methods[`_${method}`]?.(val, second);
						break;
				}

				if (!result) return false;
			}
		// }
		return true;
	},
	_ORComparision: (...args) => {
		const [firstArray, method, second, extra] = args;

		// if (typeof second !== 'object') {
			for (const val of firstArray) {
				let result = false;

				switch (method) {
					case 'includes':
						result = val?.includes?.(second);
						break;
					case '!includes':
						result = !val?.includes?.(second);
						break;
					case 'startsWith':
						result = extra ? val?.[extra]?.startsWith?.(second) : val?.startsWith?.(second);
						break;
					case 'endsWith':
						result = extra ? val?.[extra]?.endsWith?.(second) : val?.endsWith?.(second);
						break;
					case 'isEmpty':
						result = methods._ISEMPTY(val);
						break;
					case '!isEmpty':
						result = !methods._ISEMPTY(val);
						break;
					case 'EQ':
						if (extra === 'selectboxes') {
							result = val?.[second] === true;
						} else if (extra === 'select') {
							result = methods._EQ(val?.Name || val?.name, second);
						} else if (extra) {
							result = methods._EQ(val?.[extra], second);
						} else {
							result = methods._EQ(val, second);
						}
						break;
					case 'NE':
						if (extra === 'selectboxes') {
							result = val?.[second] !== true;
						} else if (extra === 'select') {
							result = methods._NE(val?.Name || val?.name, second);
						} else if (extra) {
							result = methods._NE(val?.[extra], second);
						} else {
							result = methods._NE(val, second);
						}
						break;
					case 'BETWEEN':
					case 'NOTBETWEEN':
					case 'TimeIsBetween':
					case 'DateIsBetween':
					case 'DateIsNotBetween':
					case 'DateTimeIsBetween':
					case 'DateTimeIsNotBetween':
					case 'TimeIsNotBetween':
						result = methods[`_${method}`](val, second, extra);
						break;
					case 'IsPreviousDay':
					case 'IsNextDay':
					case 'IsCurrentDay':
					case 'IsPreviousWeek':
					case 'IsCurrentWeek':
					case 'IsNextWeek':
					case 'IsPreviousMonth':
					case 'IsCurrentMonth':
					case 'IsNextMonth':
					case 'IsPreviousYear':
					case 'IsCurrentYear':
					case 'IsNextYear':
					case 'IsPast':
					case 'IsFuture':
					case 'DateTimeIsPast':
					case 'DateTimeIsFuture':
						result = methods[`_${method}`](val);
						break;
					case '!IsOfSelectedDate':
						result = !methods._IsOfSelectedDate(val, second);
						break;
					case 'isEmptySelectBox':
						result = methods._isEmptySelectBox(val);
						break;
					case '!isEmptySelectBox':
						result = !methods._isEmptySelectBox(val);
						break;
					case 'IsPreviousDayBefore':
						result = methods._IsPreviousDay(val) && methods._TimeIsBefore(val, second);
						break;
					case 'IsPreviousDayAfter':
						result = methods._IsPreviousDay(val) && methods._TimeIsAfter(val, second);
						break;
					case 'IsPreviousDayAt':
						result = methods._IsPreviousDay(val) && methods._TimeIsSame(val, second);
						break;
					case 'IsPreviousDayNotAt':
						result = methods._IsPreviousDay(val) && methods._TimeIsNotSame(val, second);
						break;
					case 'IsCurrentDayBefore':
						result = methods._IsCurrentDay(val) && methods._TimeIsBefore(val, second);
						break;
					case 'IsCurrentDayAfter':
						result = methods._IsCurrentDay(val) && methods._TimeIsAfter(val, second);
						break;
					case 'IsCurrentDayAt':
						result = methods._IsCurrentDay(val) && methods._TimeIsSame(val, second);
						break;
					case 'IsCurrentDayNotAt':
						result = methods._IsCurrentDay(val) && methods._TimeIsNotSame(val, second);
						break;
					case 'IsNextDayBefore':
						result = methods._IsNextDay(val) && methods._TimeIsBefore(val, second);
						break;
					case 'IsNextDayAfter':
						result = methods._IsNextDay(val) && methods._TimeIsAfter(val, second);
						break;
					case 'IsNextDayAt':
						result = methods._IsNextDay(val) && methods._TimeIsSame(val, second);
						break;
					case 'IsNextDayNotAt':
						result = methods._IsNextDay(val) && methods._TimeIsNotSame(val, second);
						break;
					case 'IsPreviousDayBetween':
						result = methods._IsPreviousDay(val) && methods._TimeIsBetween(val, second, extra);
						break;
					case 'IsPreviousDayNotBetween':
						result = methods._IsPreviousDay(val) && methods._TimeIsNotBetween(val, second, extra);
						break;
					case 'IsCurrentDayBetween':
						result = methods._IsCurrentDay(val) && methods._TimeIsBetween(val, second, extra);
						break;
					case 'IsCurrentDayNotBetween':
						result = methods._IsCurrentDay(val) && methods._TimeIsNotBetween(val, second, extra);
						break;
					case 'IsNextDayBetween':
						result = methods._IsNextDay(val) && methods._TimeIsBetween(val, second, extra);
						break;
					case 'IsNextDayNotBetween':
						result = methods._IsNextDay(val) && methods._TimeIsNotBetween(val, second, extra);
						break;
					default:
						result = methods[`_${method}`]?.(val, second);
						break;
				}

				if (result) return true;
			}
		// }
		return false;
	},

	_IsAnyOneOf: (value, acceptedValues = []) => {
		if (!Array.isArray(acceptedValues) || acceptedValues.length === 0) return false;

		const cleanedValues = (Array.isArray(value) ? value : [value]).filter((val) => !methods._ISEMPTY(val));
		const cleanedAcceptedValues = acceptedValues.filter((val) => !methods._ISEMPTY(val));

		if (cleanedValues.length === 0 || cleanedAcceptedValues.length === 0) return false;

		// Loose equality check with all accepted values
		return cleanedValues.some(
			(val) => cleanedAcceptedValues.some((acc) => acc == val) // loose equality
		);
	},

	_IsNoneOf: (value, disallowedValues = []) => {
		// Ensure disallowedValues is a non-empty array
		if (!Array.isArray(disallowedValues) || disallowedValues.length === 0) return false;

		const values = (Array.isArray(value) ? value : [value]).filter((v) => !methods._ISEMPTY(v));
		const disallowed = disallowedValues.filter((d) => !methods._ISEMPTY(d));

		if (values.length === 0 || disallowed.length === 0) return false;

		// None of the values should exist in disallowed list
		return !values.some((v) => disallowed.some((d) => v == d));
	},

	_TimeIsSame: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return false;
		return formatTime(args[0]).isSame(formatTime(args[1]));
	},

	_TimeIsNotSame: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return false;
		return !formatTime(args[0]).isSame(formatTime(args[1]));
	},

	_TimeIsBetween: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1]) || !isValidDate(args[2])) return false;
		return formatTime(args[0]).isBetween(formatTime(args[1]), formatTime(args[2]), undefined, '[]');
	},

	_TimeIsBefore: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return false;
		return formatTime(args[0]).isBefore(formatTime(args[1]));
	},

	_TimeIsAfter: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return false;
		return formatTime(args[0]).isAfter(formatTime(args[1]));
	},

	_DateIsBetween: (...args) => {
		const [key, startDate, endDate] = args;
		if (!isValidDate(key) || !isValidDate(startDate) || !isValidDate(endDate)) return false;
		return (
			moment(key).startOf('day').isSameOrAfter(moment(startDate).startOf('day')) &&
			moment(key).startOf('day').isSameOrBefore(moment(endDate).startOf('day'))
		);
	},

	_DateIsNotBetween: (...args) => {
		const [key, startDate, endDate] = args;
		if (!isValidDate(key) || !isValidDate(startDate) || !isValidDate(endDate)) return false;
		return (
			moment(key).startOf('day').isBefore(moment(startDate).startOf('day')) ||
			moment(key).startOf('day').isAfter(moment(endDate).startOf('day'))
		);
	},

	_IsOfSelectedDate: (...args) => {
		const [key, date] = args;
		if (!isValidDate(key) || !isValidDate(date)) return false;
		return moment(key).startOf('day').isSame(moment(date).startOf('day'), 'day');
	},

	_IsPreviousDay: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').subtract(1, 'days'));
	},

	_IsNextDay: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').add(1, 'days'));
	},

	_IsCurrentDay: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day'));
	},

	_IsBeforeXDays: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || !value) return false;
		return moment(key).startOf('day').isBefore(moment().startOf('day').subtract(value, 'days'));
	},

	_IsBefore: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || !isValidDate(value)) return false;
		return moment(key).startOf('day').isBefore(moment(value).startOf('day'));
	},

	_IsAfterXDays: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || methods._ISEMPTY(value)) return false;
		return moment(key).startOf('day').isAfter(moment().startOf('day').add(value, 'days'));
	},

	_IsPreviousWeek: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').subtract(1, 'weeks'), 'week');
	},

	_IsCurrentWeek: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day'), 'week');
	},

	_IsNextWeek: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').add(1, 'weeks'), 'week');
	},

	_IsPreviousMonth: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').subtract(1, 'months'), 'month');
	},

	_IsCurrentMonth: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day'), 'month');
	},

	_IsNextMonth: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').add(1, 'months'), 'month');
	},

	_IsPreviousYear: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').subtract(1, 'years'), 'year');
	},

	_IsCurrentYear: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day'), 'year');
	},

	_IsNextYear: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isSame(moment().startOf('day').add(1, 'years'), 'year');
	},

	_MonthIs: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || methods._ISEMPTY(value)) return false;
		return moment(key).startOf('day').month() === value - 1;
	},

	_YearIs: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || methods._ISEMPTY(value)) return false;
		return moment(key).startOf('day').year() == value;
	},

	_IsPast: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isBefore(moment().startOf('day'));
	},

	_IsFuture: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).startOf('day').isAfter(moment().startOf('day'));
	},

	_isEmptySelectBox: (obj) => {
		if (!obj || typeof obj !== 'object') return true; // treat null/undefined as empty
		return Object.values(obj).every((val) => !val);
	},

	_DateTimeIsSame: (...args) => {
		const [a, b] = args;
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return moment(a).isSame(moment(b));
	},

	_DateTimeIsNotSame: (...args) => {
		const [a, b] = args;
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return !moment(a).isSame(moment(b));
	},

	_DateTimeIsLessThan: (a, b) => {
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return moment(a).isBefore(moment(b));
	},

	_DateTimeIsGreaterThan: (a, b) => {
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return moment(a).isAfter(moment(b));
	},

	_DateTimeIsLessThanOrEqual: (a, b) => {
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return moment(a).isSameOrBefore(moment(b));
	},

	_DateTimeIsGreaterThanOrEqual: (a, b) => {
		if (!isValidDate(a) || !isValidDate(b)) return false;
		return moment(a).isSameOrAfter(moment(b));
	},

	_DateTimeIsPast: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).isBefore(moment());
	},

	_DateTimeIsFuture: (key) => {
		if (!isValidDate(key)) return false;
		return moment(key).isAfter(moment());
	},

	_DayIs: (key, day) => {
		if (!isValidDate(key) || methods._ISEMPTY(day)) return false;
		return moment(key).day() === day - 1;
	},

	_DayIsNot: (key, day) => {
		if (!isValidDate(key) || methods._ISEMPTY(day)) return false;
		return moment(key).day() !== day - 1;
	},

	_IsAnyOfSelectedDays: (key, selectedDays = []) => {
		if (!isValidDate(key) || !Array.isArray(selectedDays) || selectedDays.length === 0) return false;

		const keyDay = moment(key).day();

		return selectedDays.some(day => day == keyDay + 1);
	},

	_IsNoneOfSelectedDays: (key, selectedDays = []) => {
		if (!isValidDate(key) || !Array.isArray(selectedDays) || selectedDays.length === 0) return false;

		const keyDay = moment(key).day() + 1;

		for (const val of selectedDays) {
			const dayNum = Number(val);
			if (!val || isNaN(dayNum)) {
				return false; // Found invalid or empty month
			}
			if (keyDay === dayNum) {
				return false; // Match found, not "none of"
			}
		}

		return true; // All valid and none matched
	},

	_IsAnyOfSelectedMonth: (key, selectedMonths = []) => {
		if (!isValidDate(key) || !Array.isArray(selectedMonths) || selectedMonths.length === 0) return false;

		// moment().month() returns 0 for January, 1 for February, ..., 11 for December
		const keyMonth = moment(key).month() + 1; // Convert to 1-based (1=Jan, 12=Dec)

		return selectedMonths.some(month => month == keyMonth);
	},

	_IsNoneOfSelectedMonth: (key, selectedMonths = []) => {
		if (!isValidDate(key) || !Array.isArray(selectedMonths) || selectedMonths.length === 0) return false;

		const keyMonth = moment(key).month() + 1;

		for (const val of selectedMonths) {
			const monthNum = Number(val);
			if (!val || isNaN(monthNum)) {
				return false; // Found invalid or empty month
			}
			if (keyMonth === monthNum) {
				return false; // Match found, not "none of"
			}
		}

		return true; // All valid and none matched
	},

	_DateTimeIsBetween: (...args) => {
		const [key, startDate, endDate] = args;
		if (!isValidDate(key) || !isValidDate(startDate) || !isValidDate(endDate)) return false;
		return moment(key).isSameOrAfter(moment(startDate)) && moment(key).isSameOrBefore(moment(endDate));
	},

	_DateTimeIsNotBetween: (...args) => {
		const [key, startDate, endDate] = args;
		if (!isValidDate(key) || !isValidDate(startDate) || !isValidDate(endDate)) return false;
		return moment(key).isBefore(moment(startDate)) || moment(key).isAfter(moment(endDate));
	},

	_TimeIsNotBetween: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1]) || !isValidDate(args[2])) return false;
		return !formatTime(args[0]).isBetween(formatTime(args[1]), formatTime(args[2]), undefined, '[]');
	},

	_DateTimeIsAnyOneOf: (...args) => {
		if (!isValidDate(args[0]) || !Array.isArray(args[1])) return false;

		const validValues = args[1].filter((val) => isValidDate(val));
		if (validValues.length === 0) return false;

		const input = moment(args[0]);
		return validValues.some((val) => input.isSame(moment(val)));
	},

	_DateTimeIsNoneOf: (...args) => {
		if (!isValidDate(args[0]) || !Array.isArray(args[1]) || args[1].length === 0) return false;

		const input = moment(args[0]);

		for (const val of args[1]) {
			if (!isValidDate(val)) {
				return false; // Invalid or missing value found
			}
			if (input.isSame(moment(val))) {
				return false; // Match found, not "none of"
			}
		}

		return true; // All valid and none matched
	},

	_DateIsAnyOneOf: (...args) => {
		if (!isValidDate(args[0]) || !Array.isArray(args[1])) return false;

		const validDates = args[1].filter((val) => isValidDate(val));
		if (validDates.length === 0) return false;

		const input = moment(args[0]);
		return validDates.some((val) => input.isSame(moment(val), 'day'));
	},

	_DateIsNoneOf: (...args) => {
		if (!isValidDate(args[0]) || !Array.isArray(args[1]) || args[1].length === 0) return false;

		const input = moment(args[0]);

		for (const val of args[1]) {
			if (!isValidDate(val)) {
				return false; // Invalid or missing value found
			}
			if (input.isSame(moment(val), 'day')) {
				return false; // Match found, not "none of"
			}
		}

		return true; // All valid and none matched
	},

	_TimeIsAnyOneOf: (...args) => {
		if (!isValidDate(args[0]) || !Array.isArray(args[1])) return false;

		const validTimes = args[1].filter((val) => isValidDate(val));
		if (validTimes.length === 0) return false;

		const inputTime = formatTime(args[0]);
		return validTimes.some((val) => inputTime.isSame(formatTime(val)));
	},

	_TimeIsNoneOf: (...args) => {
		if (!isValidDate(args[0]) || !Array.isArray(args[1]) || args[1].length === 0) return false;

		const input = formatTime(args[0]);

		for (const val of args[1]) {
			if (!isValidDate(val)) {
				return false; // Invalid or missing value found
			}
			if (input.isSame(formatTime(val))) {
				return false; // Match found, not "none of"
			}
		}

		return true; // All valid and none matched
	},

	_IsAfter: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || !isValidDate(value)) return false;
		return moment(key).startOf('day').isAfter(moment(value).startOf('day'));
	},

	_DateIsLessThanOrEqual: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || !isValidDate(value)) return false;
		return moment(key).startOf('day').isSameOrBefore(moment(value).startOf('day'));
	},

	_DateIsGreaterThanOrEqual: (...args) => {
		const [key, value] = args;
		if (!isValidDate(key) || !isValidDate(value)) return false;
		return moment(key).startOf('day').isSameOrAfter(moment(value).startOf('day'));
	},
	_DATEDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1]) ||args[2]==="") return '';
			let startDate = moment(args[0])
			let endDate = moment(args[1]) 
		if (args[2]==="hours"||args[2]==="minutes"||args[2]==="seconds") {
			return endDate.diff(startDate, args[2])
		} else {
		startDate = moment(startDate).startOf('day'); // Set start date to midnight
		endDate = moment(endDate).startOf('day');   // Set end date to midnight
		return endDate.diff(startDate, args[2])
		}
	},


	_TIMEDIFF: (...args) => {
    if (!isValidDate(args[0]) || !isValidDate(args[1]) || args[2] === "") return '';
    const startDate = moment(args[0]);
    const endDate = moment(args[1]);
    const unit = args[2];
    if (unit === "minutes") {
        startDate.startOf('minute');
        endDate.startOf('minute');
    }
    if (unit === "hours" || unit === "minutes") {
        return endDate.diff(startDate, unit);
    }
},

	_DATETIMEDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1]) ||args[2]==="") return '';
			let startDate = moment(args[0])
			let endDate = moment(args[1]) 
		if (args[2]==="hours"||args[2]==="minutes"||args[2]==="seconds") {
			return endDate.diff(startDate, args[2])
		} else {
		startDate = moment(startDate).startOf('day'); // Set start date to midnight
		endDate = moment(endDate).startOf('day');   // Set end date to midnight
		return endDate.diff(startDate, args[2])
		}
	},
	_HOURSDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return '';
		const startDate = moment(args[0]).startOf('minute');
		const endDate = moment(args[1]).startOf('minute');
		return endDate.diff(startDate, 'hours');
	},
	_MINUTESDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return '';
		const startDate = moment(args[0]).startOf('minute');
		const endDate = moment(args[1]).startOf('minute');
		return endDate.diff(startDate, 'minutes');
	},
	_SECONDSDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return '';
		const startDate = moment(args[0]).startOf('seconds');
		const endDate = moment(args[1]).startOf('seconds');
		return endDate.diff(startDate, 'seconds');
	},
	_DAYSDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return '';
		const startDate = moment(args[0]).startOf('day');
		const endDate = moment(args[1]).startOf('day');
		return endDate.diff(startDate, 'days');
	},
	_MONTHSDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return '';
		const startDate = moment(args[0]).startOf('day')
		const endDate = moment(args[1]).startOf('day');
		return endDate.diff(startDate, 'months');
	},
	_YEARSDIFF: (...args) => {
		if (!isValidDate(args[0]) || !isValidDate(args[1])) return '';
		const startDate = moment(args[0]).startOf('day');
		const endDate = moment(args[1]).startOf('day');
		return endDate.diff(startDate, 'years');
	},

	_NEG: (...args) => {
		if (!isNaN(args[0])) return -Number(args[0]);
	},

	_OUTOFRANGE: (charData, analysisValues) => {
		// console.log('row',charData, analysisValues );
		if (charData?.hasOwnProperty('isOutOfSpec')) return charData.isOutOfSpec;
		if (!charData?.toleranceString) return false;

		let isNotInRange = false;
		const actionName = charData?.condition?.value;
		const configuredAction = charData?.condition?.action || '';
		let inputValues = analysisValues !== null && analysisValues !== undefined ? String(analysisValues) : '';

		if (/^\s*\.\d+/.test(inputValues)) {
			inputValues = inputValues.replace(/^\s*\./, '0.');
		}
		const targetLimit = Number(charData?.targetLimitValue);
		const highLimitValue = Number(charData?.highLimitValue);
		const lowerLimitValue = Number(charData?.lowerLimitValue);

		const alisQualtative = charData?.qualitativeAlias?.find((ele) =>
			charData?.qualitativeTolerance?.some((mat) => mat?.name === ele?.value?.name)
		);

		if (charData?.toleranceType === 'Quantitative') {
			const parsed = inputValues ? inputValues?.match(/^\s*(<=|>=|<|>|=|≥|≤|≠|!=)?\s*([+-]?\d+(\.\d+)?)/) : '';
			const operator = parsed?.[1];
			const inputValue = parsed ? parseFloat(parsed[2]) : null;

			// Fall back to condition action if no operator in input
			const effectiveOperator = operator || configuredAction || '=';

			const satisfies = (val, op, limit) => {
				switch (op) {
					case '<':
						return operator === configuredAction
							? val <= limit && op == configuredAction
							: ['≤', '<=']?.includes(configuredAction)
							? val <= limit
							: val < limit && op == configuredAction;
					case '>':
						return operator === configuredAction
							? val >= limit && op == configuredAction
							: ['≥', '>=']?.includes(configuredAction)
							? val >= limit
							: val > limit && op == configuredAction;
					case '<=':
					case '≤':
						return val <= limit && op == configuredAction;
					case '>=':
					case '≥':
						return val >= limit && op == configuredAction;
					case '=':
					case '==':
						return val === limit && op == configuredAction;
					case '!=':
					case '≠':
						return val !== limit && op == configuredAction;
					default:
						return false;
				}
			};

			const isValid = satisfies(inputValue, effectiveOperator, targetLimit);

			if (analysisValues && !inputValue && inputValue !== 0) return true;

			if (
				actionName === 'Between/Range' &&
				inputValue !== null &&
				(inputValue > highLimitValue || inputValue < lowerLimitValue)
			) {
				isNotInRange = true;
			} else if (
				actionName === 'Target' &&
				inputValue !== null &&
				(inputValue > highLimitValue || inputValue < lowerLimitValue)
			) {
				isNotInRange = true;
			} else if (effectiveOperator === '<' && inputValue !== null && !isValid) {
				isNotInRange = true;
			} else if (effectiveOperator === '>' && inputValue !== null && !isValid) {
				isNotInRange = true;
			} else if (
				(effectiveOperator === '≥' || effectiveOperator === '>=') &&
				inputValue !== null &&
				!(inputValue >= targetLimit)
			) {
				isNotInRange = true;
			} else if (
				(effectiveOperator === '≤' || effectiveOperator === '<=') &&
				inputValue !== null &&
				!(inputValue <= targetLimit)
			) {
				isNotInRange = true;
			} else if (
				(effectiveOperator === '=' || effectiveOperator === '') &&
				inputValue !== null &&
				inputValue != targetLimit
			) {
				isNotInRange = true;
			} else if (
				(effectiveOperator === '≠' || effectiveOperator === '!=') &&
				inputValue !== null &&
				inputValue === targetLimit
			) {
				isNotInRange = true;
			} else {
				isNotInRange = false;
			}
		} else if (
			analysisValues !== null &&
			analysisValues !== undefined &&
			analysisValues !== '' &&
			(charData?.toleranceType === 'Qualitative'
				? Array.isArray(charData?.qualitativeTolerance) &&
					!charData.qualitativeTolerance.some((q) => q?.name?.trim() === analysisValues?.trim()) &&
					!alisQualtative?.alias?.some((q) => q?.name?.trim() === analysisValues?.trim())
				: charData?.toleranceType === 'Descriptive'
				? charData?.descriptiveTolerance && charData.descriptiveTolerance?.trim() !== analysisValues?.trim()
				: true)
		) {
			isNotInRange = true;
		}

		return isNotInRange;
	},
};

export function checkCustomConditional(component, custom, row, data, form, variable, onError, instance) {
  if (typeof custom === 'string') {
    const mStr = custom.split('result =')[1] || custom;
    custom = `var ${variable} = true; result =${mStr}; return ${variable};`;
  }
  const value = (instance && instance.evaluate) ?
    instance.evaluate(custom, { row, data, form, ...methods, d:data, r:row } ) :
    evaluate(custom, { row, data, form, ...methods, d:data, r:row  });
  if (value === null) {
    return onError;
  }
  return value;
}

export function checkJsonConditional(component, json, row, data, form, onError) {
  try {
    return jsonLogic.apply(json, {
      data,
      row,
      form,
      _,
    });
  }
  catch (err) {
    console.warn(`An error occurred in jsonLogic advanced condition for ${component.key}`, err);
    return onError;
  }
}

function getRow(component, row, instance, conditional) {
  const condition = conditional || component.conditional;
  // If no component's instance passed (happens only in 6.x server), calculate its path based on the schema
  if (!instance) {
    instance = _.cloneDeep(component);
    setPathToComponentAndPerentSchema(instance);
  }
  const dataParent = getDataParentComponent(instance);
  const parentPath = dataParent ? getComponentPath(dataParent) : null;
  if (dataParent && condition.when?.startsWith(parentPath)) {
    const newRow = {};
    _.set(newRow, parentPath, row);
    row = newRow;
  }

  return row;
}

/**
 * Checks the conditions for a provided component and data.
 *
 * @param component
 *   The component to check for the condition.
 * @param row
 *   The data within a row
 * @param data
 *   The full submission data.
 *
 * @returns {boolean}
 */
export function checkCondition(component, row, data, form, instance) {
  const { customConditional, conditional } = component;
  if (customConditional) {
    return checkCustomConditional(component, customConditional, row, data, form, 'show', true, instance);
  }
  else if (conditional && conditional.when) {
    row = getRow(component, row, instance);
    return checkSimpleConditional(component, conditional, row, data);
  }
  else if (conditional && conditional.json) {
    return checkJsonConditional(component, conditional.json, row, data, form, true);
  }

  // Default to show.
  return true;
}

/**
 * Test a trigger on a component.
 *
 * @param component
 * @param action
 * @param data
 * @param row
 * @returns {mixed}
 */
export function checkTrigger(component, trigger, row, data, form, instance) {
  // If trigger is empty, don't fire it
  if (!trigger[trigger.type]) {
    return false;
  }

  switch (trigger.type) {
    case 'simple':
      row = getRow(component, row, instance, trigger.simple);
      return checkSimpleConditional(component, trigger.simple, row, data);
    case 'javascript':
      return checkCustomConditional(component, trigger.javascript, row, data, form, 'result', false, instance);
    case 'json':
      return checkJsonConditional(component, trigger.json, row, data, form, false);
  }
  // If none of the types matched, don't fire the trigger.
  return false;
}

export function setActionProperty(component, action, result, row, data, instance) {
  const property = action.property.value;

  switch (action.property.type) {
    case 'boolean': {
      const currentValue = _.get(component, property, false).toString();
      const newValue = action.state.toString();

      if (currentValue !== newValue) {
        _.set(component, property, newValue === 'true');
      }

      break;
    }
    case 'string': {
      const evalData = {
        data,
        row,
        component,
        result,
      };
      const textValue = action.property.component ? action[action.property.component] : action.text;
      const currentValue = _.get(component, property, '');
      const newValue = (instance && instance.interpolate)
        ? instance.interpolate(textValue, evalData)
        : Evaluator.interpolate(textValue, evalData);

      if (newValue !== currentValue) {
        _.set(component, property, newValue);
      }

      break;
    }
  }

  return component;
}

/**
 * Unescape HTML characters like &lt, &gt, &amp and etc.
 * @param str
 * @returns {string}
 */
export function unescapeHTML(str) {
  if (typeof window === 'undefined' || !('DOMParser' in window)) {
    return str;
  }

  const doc = new window.DOMParser().parseFromString(str, 'text/html');
  return doc.documentElement.textContent;
}

/**
 * Make HTML element from string
 * @param str
 * @param selector
 * @returns {HTMLElement}
 */

export function convertStringToHTMLElement(str, selector) {
  const doc = new window.DOMParser().parseFromString(str, 'text/html');
  return doc.body.querySelector(selector);
}

/**
 * Make a filename guaranteed to be unique.
 * @param name
 * @param template
 * @param evalContext
 * @returns {string}
 */
export function uniqueName(name, template, evalContext) {
  template = template || '{{fileName}}-{{guid}}';
  //include guid in template anyway, to prevent overwriting issue if filename matches existing file
  if (!template.includes('{{guid}}')) {
    template = `${template}-{{guid}}`;
  }
  const parts = name.split('.');
  let fileName = parts.slice(0, parts.length - 1).join('.');
  const extension = parts.length > 1
    ? `.${_.last(parts)}`
    : '';
  //allow only 100 characters from original name to avoid issues with filename length restrictions
  fileName = fileName.substr(0, 100);
  evalContext = Object.assign(evalContext || {}, {
    fileName,
    guid: guid()
  });
  //only letters, numbers, dots, dashes, underscores and spaces are allowed. Anything else will be replaced with dash
  const uniqueName = `${Evaluator.interpolate(template, evalContext)}${extension}`.replace(/[^0-9a-zA-Z.\-_ ]/g, '-');
  return uniqueName;
}

export function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random()*16|0;
    const v = c === 'x'
      ? r
      : (r&0x3|0x8);
    return v.toString(16);
  });
}

/**
 * Return a translated date setting.
 *
 * @param date
 * @return {(null|Date)}
 */
export function getDateSetting(date) {
  if (_.isNil(date) || _.isNaN(date) || date === '') {
    return null;
  }

  if (date instanceof Date) {
    return date;
  }
  else if (typeof date.toDate === 'function') {
    return date.isValid() ? date.toDate() : null;
  }

  let dateSetting = ((typeof date !== 'string') || (date.indexOf('moment(') === -1)) ? moment(date) : null;
  if (dateSetting && dateSetting.isValid()) {
    return dateSetting.toDate();
  }

  dateSetting = null;
  try {
    const value = Evaluator.evaluator(`return ${date};`, 'moment')(moment);
    if (typeof value === 'string') {
      dateSetting = moment(value);
    }
    else if (typeof value.toDate === 'function') {
      dateSetting = moment(value.toDate().toUTCString());
    }
    else if (value instanceof Date) {
      dateSetting = moment(value);
    }
  }
  catch (e) {
    return null;
  }

  if (!dateSetting) {
    return null;
  }

  // Ensure this is a date.
  if (!dateSetting.isValid()) {
    return null;
  }

  return dateSetting.toDate();
}

export function isValidDate(date) {
  return _.isDate(date) && !_.isNaN(date.getDate());
}

/**
 * Get the current timezone string.
 *
 * @return {string}
 */
export function currentTimezone() {
  if (moment.currentTimezone) {
    return moment.currentTimezone;
  }
  moment.currentTimezone = jtz.determine().name();
  return moment.currentTimezone;
}

/**
 * Get an offset date provided a date object and timezone object.
 *
 * @param date
 * @param timezone
 * @return {Date}
 */
export function offsetDate(date, timezone) {
  if (timezone === 'UTC') {
    return {
      date: new Date(date.getTime() + (date.getTimezoneOffset() * 60000)),
      abbr: 'UTC'
    };
  }
  const dateMoment = moment(date).tz(timezone);
  return {
    date: new Date(date.getTime() + ((dateMoment.utcOffset() + date.getTimezoneOffset()) * 60000)),
    abbr: dateMoment.format('z')
  };
}

/**
 * Returns if the zones are loaded.
 *
 * @return {boolean}
 */
export function zonesLoaded() {
  return moment.zonesLoaded;
}

/**
 * Returns if we should load the zones.
 *
 * @param timezone
 * @return {boolean}
 */
export function shouldLoadZones(timezone) {
  if (timezone === currentTimezone() || timezone === 'UTC') {
    return false;
  }
  return true;
}

/**
 * Externally load the timezone data.
 *
 * @return {Promise<any> | *}
 */
export function loadZones(timezone) {
  if (timezone && !shouldLoadZones(timezone)) {
    // Return non-resolving promise.
    return new NativePromise(_.noop);
  }

  if (moment.zonesPromise) {
    return moment.zonesPromise;
  }
  return moment.zonesPromise = fetch(
    'https://cdn.form.io/moment-timezone/data/packed/latest.json',
  ).then(resp => resp.json().then(zones => {
    moment.tz.load(zones);
    moment.zonesLoaded = true;

    // Trigger a global event that the timezones have finished loading.
    if (document && document.createEvent && document.body && document.body.dispatchEvent) {
      var event = document.createEvent('Event');
      event.initEvent('zonesLoaded', true, true);
      document.body.dispatchEvent(event);
    }
  }));
}

/**
 * Get the moment date object for translating dates with timezones.
 *
 * @param value
 * @param format
 * @param timezone
 * @return {*}
 */
export function momentDate(value, format, timezone) {
  const momentDate = moment(value);
  if (timezone === 'UTC') {
    timezone = 'Etc/UTC';
  }
  if ((timezone !== currentTimezone() || (format && format.match(/\s(z$|z\s)/))) && moment.zonesLoaded) {
    return momentDate.tz(timezone);
  }
  return momentDate;
}

/**
 * Format a date provided a value, format, and timezone object.
 *
 * @param value
 * @param format
 * @param timezone
 * @return {string}
 */
export function formatDate(value, format, timezone, flatPickrInputFormat) {
  const momentDate = moment(value, flatPickrInputFormat || undefined);
  if (timezone === currentTimezone()) {
    // See if our format contains a "z" timezone character.
    if (format.match(/\s(z$|z\s)/)) {
      loadZones();
      if (moment.zonesLoaded) {
        return momentDate.tz(timezone).format(convertFormatToMoment(format));
      }
      else {
        return momentDate.format(convertFormatToMoment(format.replace(/\s(z$|z\s)/, '')));
      }
    }

    // Return the standard format.
    return momentDate.format(convertFormatToMoment(format));
  }
  if (timezone === 'UTC') {
    const offset = offsetDate(momentDate.toDate(), 'UTC');
    return `${moment(offset.date).format(convertFormatToMoment(format))} UTC`;
  }

  // Load the zones since we need timezone information.
  loadZones();
  if (moment.zonesLoaded && timezone) {
    return momentDate.tz(timezone).format(`${convertFormatToMoment(format)} z`);
  }
  else {
    return momentDate.format(convertFormatToMoment(format));
  }
}

/**
 * Pass a format function to format within a timezone.
 *
 * @param formatFn
 * @param date
 * @param format
 * @param timezone
 * @return {string}
 */
export function formatOffset(formatFn, date, format, timezone) {
  if (timezone === currentTimezone()) {
    return formatFn(date, format);
  }
  if (timezone === 'UTC') {
    return `${formatFn(offsetDate(date, 'UTC').date, format)} UTC`;
  }

  // Load the zones since we need timezone information.
  loadZones();
  if (moment.zonesLoaded) {
    const offset = offsetDate(date, timezone);
    return `${formatFn(offset.date, format)} ${offset.abbr}`;
  }
  else {
    return formatFn(date, format);
  }
}

export function getLocaleDateFormatInfo(locale) {
  const formatInfo = {};

  const day = 21;
  const exampleDate = new Date(2017, 11, day);
  const localDateString = exampleDate.toLocaleDateString(locale);

  formatInfo.dayFirst = localDateString.slice(0, 2) === day.toString();

  return formatInfo;
}

/**
 * Convert the format from the angular-datepicker module to flatpickr format.
 * @param format
 * @return {string}
 */
export function convertFormatToFlatpickr(format) {
  return format
  // Remove the Z timezone offset, not supported by flatpickr.
    .replace(/Z/g, '')

    // Year conversion.
    .replace(/y/g, 'Y')
    .replace('YYYY', 'Y')
    .replace('YY', 'y')

    // Month conversion.
    .replace('MMMM', 'F')
    .replace(/M/g, 'n')
    .replace('nnn', 'M')
    .replace('nn', 'm')

    // Day in month.
    .replace(/d/g, 'j')
    .replace(/jj/g, 'd')

    // Day in week.
    .replace('EEEE', 'l')
    .replace('EEE', 'D')

    // Hours, minutes, seconds
    .replace('HH', 'H')
    .replace('hh', 'G')
    .replace('mm', 'i')
    .replace('ss', 'S')
    .replace(/a/g, 'K');
}

/**
 * Convert the format from the angular-datepicker module to moment format.
 * @param format
 * @return {string}
 */
export function convertFormatToMoment(format) {
  return format
  // Year conversion.
    .replace(/y/g, 'Y')
    // Day in month.
    .replace(/d/g, 'D')
    // Day in week.
    .replace(/E/g, 'd')
    // AM/PM marker
    .replace(/a/g, 'A')
    // Unix Timestamp
    .replace(/U/g, 'X');
}

export function convertFormatToMask(format) {
  return format
  // Long month replacement.
    .replace(/M{4}/g, 'MM')
    // Initial short month conversion.
    .replace(/M{3}/g, '***')
    // Short month conversion if input as text.
    .replace(/e/g, 'Q')
    // Year conversion.
    .replace(/[ydhmsHMG]/g, '9')
    // AM/PM conversion.
    .replace(/a/g, 'AA');
}

/**
 * Returns an input mask that is compatible with the input mask library.
 * @param {string} mask - The Form.io input mask.
 * @param {string} placeholderChar - Char which is used as a placeholder.
 * @returns {Array} - The input mask for the mask library.
 */
export function getInputMask(mask, placeholderChar) {
  if (mask instanceof Array) {
    return mask;
  }
  const maskArray = [];
  maskArray.numeric = true;
  for (let i = 0; i < mask.length; i++) {
    switch (mask[i]) {
      case '9':
        maskArray.push(/\d/);
        break;
      case 'A':
        maskArray.numeric = false;
        maskArray.push(/[a-zA-Z]/);
        break;
      case 'a':
        maskArray.numeric = false;
        maskArray.push(/[a-z]/);
        break;
      case '*':
        maskArray.numeric = false;
        maskArray.push(/[a-zA-Z0-9]/);
        break;
      // If char which is used inside mask placeholder was used in the mask, replace it with space to prevent errors
      case placeholderChar:
        maskArray.numeric = false;
        maskArray.push(' ');
        break;
      default:
        maskArray.numeric = false;
        maskArray.push(mask[i]);
        break;
    }
  }
  return maskArray;
}

export function unmaskValue(value, mask, placeholderChar) {
  if (!mask || !value || value.length > mask.length) {
    return value;
  }

  let unmaskedValue = value.split('');

  for (let i = 0; i < mask.length; i++) {
    const char = value[i] || '';
    const charPart = mask[i];

    if (!_.isRegExp(charPart) && char === charPart) {
      unmaskedValue[i] = '';
    }
  }

  unmaskedValue = unmaskedValue.join('').replace(placeholderChar, '');

  return unmaskedValue;
}

export function matchInputMask(value, inputMask) {
  if (!inputMask) {
    return true;
  }

  // If value is longer than mask, it isn't valid.
  if (value.length > inputMask.length) {
    return false;
  }

  for (let i = 0; i < inputMask.length; i++) {
    const char = value[i] || '';
    const charPart = inputMask[i];

    if (!(_.isRegExp(charPart) && charPart.test(char) || charPart === char)) {
      return false;
    }
  }

  return true;
}

export function getNumberSeparators(lang = 'en') {
  const formattedNumberString = (12345.6789).toLocaleString(lang);
  const delimeters = formattedNumberString.match(/..(.)...(.)../);
  if (!delimeters) {
    return {
      delimiter: ',',
      decimalSeparator: '.'
    };
  }
  return {
    delimiter: (delimeters.length > 1) ? delimeters[1] : ',',
    decimalSeparator: (delimeters.length > 2) ? delimeters[2] : '.',
  };
}

export function getNumberDecimalLimit(component, defaultLimit) {
  if (_.has(component, 'decimalLimit')) {
    return _.get(component, 'decimalLimit');
  }
  // Determine the decimal limit. Defaults to 20 but can be overridden by validate.step or decimalLimit settings.
  let decimalLimit = defaultLimit || 20;
  const step = _.get(component, 'validate.step', 'any');

  if (step !== 'any') {
    const parts = step.toString().split('.');
    if (parts.length > 1) {
      decimalLimit = parts[1].length;
    }
  }

  return decimalLimit;
}

export function getCurrencyAffixes({
   currency = 'USD',
   decimalLimit,
   decimalSeparator,
   lang,
 }) {
  // Get the prefix and suffix from the localized string.
  let regex = `(.*)?${(100).toLocaleString(lang)}`;
  if (decimalLimit) {
    regex += `${decimalSeparator === '.' ? '\\.' : decimalSeparator}${(0).toLocaleString(lang)}{${decimalLimit}}`;
  }
  regex += '(.*)?';
  const parts = (100).toLocaleString(lang, {
    style: 'currency',
    currency,
    useGrouping: true,
    maximumFractionDigits: decimalLimit || 0,
    minimumFractionDigits: decimalLimit || 0
  }).replace('.', decimalSeparator).match(new RegExp(regex));
  return {
    prefix: parts?.[1] || '',
    suffix: parts?.[2] || ''
  };
}

/**
 * Fetch the field data provided a component.
 *
 * @param data
 * @param component
 * @return {*}
 */
export function fieldData(data, component) {
  if (!data) {
    return '';
  }
  if (!component || !component.key) {
    return data;
  }
  if (component.key.includes('.')) {
    let value = data;
    const parts = component.key.split('.');
    let key = '';
    for (let i = 0; i < parts.length; i++) {
      key = parts[i];

      // Handle nested resources
      if (value.hasOwnProperty('_id')) {
        value = value.data;
      }

      // Return if the key is not found on the value.
      if (!value.hasOwnProperty(key)) {
        return;
      }

      // Convert old single field data in submissions to multiple
      if (key === parts[parts.length - 1] && component.multiple && !Array.isArray(value[key])) {
        value[key] = [value[key]];
      }

      // Set the value of this key.
      value = value[key];
    }
    return value;
  }
  else {
    // Convert old single field data in submissions to multiple
    if (component.multiple && !Array.isArray(data[component.key])) {
      data[component.key] = [data[component.key]];
    }

    // Fix for checkbox type radio submission values in tableView
    if (component.type === 'checkbox' && component.inputType === 'radio') {
      return data[component.name] === component.value;
    }

    return data[component.key];
  }
}

/**
 * Delays function execution with possibility to execute function synchronously or cancel it.
 *
 * @param fn Function to delay
 * @param delay Delay time
 * @return {*}
 */
export function delay(fn, delay = 0, ...args) {
  const timer = setTimeout(fn, delay, ...args);

  function cancel() {
    clearTimeout(timer);
  }

  function earlyCall() {
    cancel();
    return fn(...args);
  }

  earlyCall.timer = timer;
  earlyCall.cancel = cancel;

  return earlyCall;
}

/**
 * Iterate the given key to make it unique.
 *
 * @param {String} key
 *   Modify the component key to be unique.
 *
 * @returns {String}
 *   The new component key.
 */
export function iterateKey(key) {
  if (!key.match(/(\d+)$/)) {
    return `${key}1`;
  }

  return key.replace(/(\d+)$/, function(suffix) {
    return Number(suffix) + 1;
  });
}

/**
 * Determines a unique key within a map provided the base key.
 *
 * @param map
 * @param base
 * @return {*}
 */
export function uniqueKey(map, base) {
  let newKey = base;
  while (map.hasOwnProperty(newKey)) {
    newKey = iterateKey(newKey);
  }
  return newKey;
}

/**
 * Determines the major version number of bootstrap.
 *
 * @return {number}
 */
export function bootstrapVersion(options) {
  if (options.bootstrap) {
    return options.bootstrap;
  }
  if ((typeof $ === 'function') && (typeof $().collapse === 'function')) {
    return parseInt($.fn.collapse.Constructor.VERSION.split('.')[0], 10);
  }
  return 0;
}

/**
 * Retrun provided argument.
 * If argument is a function, returns the result of a function call.
 * @param {*} e;
 *
 * @return {*}
 */
export function unfold(e) {
  if (typeof e === 'function') {
    return e();
  }

  return e;
}

/**
 * Map values through unfold and return first non-nil value.
 * @param {Array<T>} collection;
 *
 * @return {T}
 */
export const firstNonNil = _.flow([
  _.partialRight(_.map, unfold),
  _.partialRight(_.find, v => !_.isUndefined(v))
]);

/*
 * Create enclosed state.
 * Returns functions to getting and cycling between states.
 * @param {*} a - initial state.
 * @param {*} b - next state.
 * @return {Functions[]} -- [get, toggle];
 */
export function withSwitch(a, b) {
  let state = a;
  let next = b;

  function get() {
    return state;
  }

  function toggle() {
    const prev = state;
    state = next;
    next = prev;
  }

  return [get, toggle];
}

export function observeOverload(callback, options = {}) {
  const { limit = 50, delay = 500 } = options;
  let callCount = 0;
  let timeoutID = 0;

  const reset = () => callCount = 0;

  return () => {
    if (timeoutID !== 0) {
      clearTimeout(timeoutID);
      timeoutID = 0;
    }

    timeoutID = setTimeout(reset, delay);

    callCount += 1;

    if (callCount >= limit) {
      clearTimeout(timeoutID);
      reset();
      return callback();
    }
  };
}

export function getContextComponents(context) {
  const values = [];

  context.utils.eachComponent(context.instance.options.editForm.components, (component, path) => {
    if (component.key !== context.data.key) {
      values.push({
        label: `${component.label || component.key} (${path})`,
        value: path,
      });
    }
  });

  return values;
}

export function getContextButtons(context) {
  const values = [];

  context.utils.eachComponent(context.instance.options.editForm.components, (component) => {
    if (component.type === 'button') {
      values.push({
        label: `${component.key} (${component.label})`,
        value: component.key,
      });
    }
  });

  return values;
}

// Tags that could be in text, that should be ommited or handled in a special way
const inTextTags = ['#text', 'A', 'B', 'EM', 'I', 'SMALL', 'STRONG', 'SUB', 'SUP', 'INS', 'DEL', 'MARK', 'CODE'];

/**
 * Helper function for 'translateHTMLTemplate'. Translates text value of the passed html element.
 *
 * @param {HTMLElement} elem
 * @param {Function} translate
 *
 * @returns {String}
 *   Translated element template.
 */
function translateElemValue(elem, translate) {
  if (!elem.innerText) {
    return elem.innerHTML;
  }

  const elemValue = elem.innerText.replace(Evaluator.templateSettings.interpolate, '').replace(/\s\s+/g, ' ').trim();
  const translatedValue = translate(elemValue);

  if (elemValue !== translatedValue) {
    const links = elem.innerHTML.match(/<a[^>]*>(.*?)<\/a>/g);

    if (links && links.length) {
      if (links.length === 1 && links[0].length === elem.innerHTML.length) {
        return elem.innerHTML.replace(elemValue, translatedValue);
      }

      const translatedLinks = links.map(link => {
        const linkElem = document.createElement('a');
        linkElem.innerHTML = link;
        return translateElemValue(linkElem, translate);
      });

      return `${translatedValue} (${translatedLinks.join(', ')})`;
    }
    else {
      return elem.innerText.replace(elemValue, translatedValue);
    }
  }
  else {
    return elem.innerHTML;
  }
}

/**
 * Helper function for 'translateHTMLTemplate'. Goes deep through html tag children and calls function to translate their text values.
 *
 * @param {HTMLElement} tag
 * @param {Function} translate
 *
 * @returns {void}
 */
function translateDeepTag(tag, translate) {
  const children = tag.children.length && [...tag.children];
  const shouldTranslateEntireContent = children && children.every(child =>
    child.children.length === 0
    && inTextTags.some(tag => child.nodeName === tag)
  );

  if (!children || shouldTranslateEntireContent) {
    tag.innerHTML = translateElemValue(tag, translate);
  }
  else {
    children.forEach(child => translateDeepTag(child, translate));
  }
}

/**
 * Translates text values in html template.
 *
 * @param {String} template
 * @param {Function} translate
 *
 * @returns {String}
 *   Html template with translated values.
 */
export function translateHTMLTemplate(template, translate) {
  const isHTML = /<[^>]*>/.test(template);

  if (!isHTML) {
    return translate(template);
  }

  const tempElem = document.createElement('div');
  tempElem.innerHTML = template;

  if (tempElem.innerText && tempElem.children.length) {
    translateDeepTag(tempElem, translate);
    return tempElem.innerHTML;
  }

  return template;
}

/**
 * Sanitize an html string.
 *
 * @param string
 * @returns {*}
 */
export function sanitize(string, options) {
  if (typeof dompurify.sanitize !== 'function') {
    return string;
  }
  // Dompurify configuration
  const sanitizeOptions = {
    ADD_ATTR: ['ref', 'target'],
    USE_PROFILES: { html: true }
  };
  // Add attrs
  if (options.sanitizeConfig && Array.isArray(options.sanitizeConfig.addAttr) && options.sanitizeConfig.addAttr.length > 0) {
    options.sanitizeConfig.addAttr.forEach((attr) => {
      sanitizeOptions.ADD_ATTR.push(attr);
    });
  }
  // Add tags
  if (options.sanitizeConfig && Array.isArray(options.sanitizeConfig.addTags) && options.sanitizeConfig.addTags.length > 0) {
    sanitizeOptions.ADD_TAGS = options.sanitizeConfig.addTags;
  }
  // Allow tags
  if (options.sanitizeConfig && Array.isArray(options.sanitizeConfig.allowedTags) && options.sanitizeConfig.allowedTags.length > 0) {
    sanitizeOptions.ALLOWED_TAGS = options.sanitizeConfig.allowedTags;
  }
  // Allow attributes
  if (options.sanitizeConfig && Array.isArray(options.sanitizeConfig.allowedAttrs) && options.sanitizeConfig.allowedAttrs.length > 0) {
    sanitizeOptions.ALLOWED_ATTR = options.sanitizeConfig.allowedAttrs;
  }
  // Allowd URI Regex
  if (options.sanitizeConfig && options.sanitizeConfig.allowedUriRegex) {
    sanitizeOptions.ALLOWED_URI_REGEXP = options.sanitizeConfig.allowedUriRegex;
  }
  // Allow to extend the existing array of elements that are safe for URI-like values
  if (options.sanitizeConfig && Array.isArray(options.sanitizeConfig.addUriSafeAttr) && options.sanitizeConfig.addUriSafeAttr.length > 0) {
    sanitizeOptions.ADD_URI_SAFE_ATTR = options.sanitizeConfig.addUriSafeAttr;
  }
  return dompurify.sanitize(string, sanitizeOptions);
}

/**
 * Fast cloneDeep for JSON objects only.
 */
export function fastCloneDeep(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

export { Evaluator, interpolate };

export function isInputComponent(componentJson) {
  if (componentJson.input === false || componentJson.input === true) {
    return componentJson.input;
  }
  switch (componentJson.type) {
    case 'htmlelement':
    case 'content':
    case 'columns':
    case 'fieldset':
    case 'panel':
    case 'table':
    case 'tabs':
    case 'well':
    case 'button':
      return false;
    default:
      return true;
  }
}

export function getArrayFromComponentPath(pathStr) {
  if (!pathStr || !_.isString(pathStr)) {
    if (!_.isArray(pathStr)) {
      return [pathStr];
    }
    return pathStr;
  }
  return pathStr.replace(/[[\]]/g, '.')
    .replace(/\.\./g, '.')
    .replace(/(^\.)|(\.$)/g, '')
    .split('.')
    .map(part => _.defaultTo(_.toNumber(part), part));
}

export function  hasInvalidComponent(component) {
  return component.getComponents().some((comp) => {
    if (_.isArray(comp.components)) {
      return hasInvalidComponent(comp);
    }
      return comp.error;
  });
}

export function getStringFromComponentPath(path) {
  if (!_.isArray(path)) {
    return path;
  }
  let strPath = '';
  path.forEach((part, i) => {
    if (_.isNumber(part)) {
      strPath += `[${part}]`;
    }
    else {
      strPath += i === 0 ? part : `.${part}`;
    }
  });
  return strPath;
}

export function round(number, precision) {
  if (_.isNumber(number)) {
    return number.toFixed(precision);
  }
  return number;
}

/**
 * Check for Internet Explorer browser version
 *
 * @return {(number|null)}
 */
export function getIEBrowserVersion() {
  const { ie, version } = getBrowserInfo();

  return ie ? version : null;
}

/**
 * Get browser name and version (modified from 'jquery-browser-plugin')
 *
 * @return {Object} -- {{browser name, version, isWebkit?}}
 * Possible browser names: chrome, safari, ie, edge, opera, mozilla, yabrowser
 */
export function getBrowserInfo() {
  const browser = {};

  if (typeof window === 'undefined') {
    return browser;
  }

  const ua = window.navigator.userAgent.toLowerCase();
  const match = /(edge|edg)\/([\w.]+)/.exec(ua) ||
                /(opr)[/]([\w.]+)/.exec(ua) ||
                /(yabrowser)[ /]([\w.]+)/.exec(ua) ||
                /(chrome)[ /]([\w.]+)/.exec(ua) ||
                /(iemobile)[/]([\w.]+)/.exec(ua) ||
                /(version)(applewebkit)[ /]([\w.]+).*(safari)[ /]([\w.]+)/.exec(ua) ||
                /(webkit)[ /]([\w.]+).*(version)[ /]([\w.]+).*(safari)[ /]([\w.]+)/.exec(ua) ||
                /(webkit)[ /]([\w.]+)/.exec(ua) ||
                /(opera)(?:.*version|)[ /]([\w.]+)/.exec(ua) ||
                /(msie) ([\w.]+)/.exec(ua) ||
                ua.indexOf('trident') >= 0 && /(rv)(?::| )([\w.]+)/.exec(ua) ||
                ua.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/.exec(ua) ||
                [];
  const matched = {
    browser: match[5] || match[3] || match[1] || '',
    version: match[4] || match[2] || '0'
  };

  if (matched.browser) {
    browser[matched.browser] = true;
    browser.version = parseInt(matched.version, 10);
  }
  // Chrome, Opera 15+, Safari and Yandex.Browser are webkit based browsers
  if (browser.chrome || browser.opr || browser.safari || browser.edg || browser.yabrowser) {
    browser.isWebkit = true;
  }
  // IE11 has a new token so we will assign it ie to avoid breaking changes
  if (browser.rv || browser.iemobile) {
    browser.ie = true;
  }
  // Edge has a new token since it became webkit based
  if (browser.edg) {
    browser.edge = true;
  }
  // Opera 15+ are identified as opr
  if (browser.opr) {
    browser.opera = true;
  }

  return browser;
}

export function getComponentPathWithoutIndicies(path = '') {
  return path.replace(/\[\d+\]/, '');
}

/**
 * Returns a path to the component which based on its schema
 * @param {*} component is a component's schema containing link to its parent's schema in the 'parent' property
 */
export function getComponentPath(component, path = '') {
  if (!component || !component.key || component?._form?.display === 'wizard') { // unlike the Webform, the Wizard has the key and it is a duplicate of the panel key
    return path;
  }
  path = component.isInputComponent || component.input === true ? `${component.key}${path ? '.' : ''}${path}` : path;
  return getComponentPath(component.parent, path);
}

/**
 * Returns a parent component of the passed component instance skipping all the Layout components
 * @param {*} componentInstance
 * @return {(Component|undefined)}
 */
export function getDataParentComponent(componentInstance) {
  if (!componentInstance) {
    return;
  }
  const { parent } = componentInstance;
  if (parent && (parent.isInputComponent || parent.input)) {
    return parent;
  }
  else {
    return getDataParentComponent(parent);
  }
}

/**
 * Returns whether the value is a promise
 * @param value
 * @return {boolean}
 */
 export function isPromise(value) {
   return value
     && value.then
     && typeof value.then === 'function'
     && value?.constructor?.name === 'Promise';
 }

/**
 * Determines if the component has a scoping parent in tree (a component which scopes its children and manages its
 * changes by itself, e.g. EditGrid)
 * @param componentInstance
 * @param firstPass
 * @returns {boolean|boolean|*}
 */
export function isInsideScopingComponent(componentInstance, firstPass = true) {
  if (!firstPass && componentInstance?.hasScopedChildren) {
    return true;
  }
  const dataParent = getDataParentComponent(componentInstance);
  if (dataParent?.hasScopedChildren) {
    return true;
  }
  else if (dataParent?.parent) {
    return isInsideScopingComponent(dataParent.parent, false);
  }
  return false;
}

export function getFocusableElements(element) {
  const focusableSelector =
    `button:not([disabled]), input:not([disabled]), select:not([disabled]),
    textarea:not([disabled]), button:not([disabled]), [href]`;
  return element.querySelectorAll(focusableSelector);
}

// Export lodash to save space with other libraries.
export { _ };
