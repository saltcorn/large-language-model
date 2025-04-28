/**
 * src/llmFunctionCall/stringUtils.js
 *
 * Simple string utilities shared by LLM function-call action helpers.
 *
 * Author:  Troy Kelly <troy@team.production.city>
 * Updated: 28 Apr 2025
 */

'use strict';

/**
 * Remove all space characters from the supplied string.
 *
 * @param {string} text
 * @returns {string}
 */
function removeSpaces(text) {
  return text.replaceAll(' ', '');
}

module.exports = { removeSpaces };