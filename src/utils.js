/**
 * src/utils.js
 *
 * Shared utility helpers for the Saltcorn “Large-Language-Model” plug-in.
 * ────────────────────────────────────────────────────────────────────────────
 *  • safeConfig() – guarantees a non-null configuration object so that the
 *    plug-in may be loaded before an administrator has saved any settings.
 *
 * Author:   Troy Kelly <troy@team.production.city>
 * Created:  10 May 2025
 */

'use strict';

/* -------------------------------------------------------------------------- */
/* API – safeConfig                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns the supplied configuration object if it is a non-null object;
 * otherwise returns an empty object.  This prevents the common
 * “cannot read property ‘…’ of undefined” crash that occurs during the
 * very first load of a plug-in when no settings have been saved yet.
 *
 * @template {object} T
 * @param   {T | null | undefined} cfg
 * @returns {T}
 */
function safeConfig(cfg) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return (cfg && typeof cfg === 'object' ? cfg : {}) as unknown as T;
}

module.exports = { safeConfig };