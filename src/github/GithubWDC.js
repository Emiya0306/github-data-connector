"use strict";
import Github from './components/Github';
import _ from 'lodash';

// Global variables
let gh;

/**
 * Wrapper around the Tableau WDC for using the Github API.
 */
class GithubWDC {

  constructor() {
    this._cache = {};
    this._requestType = null;
  }

  /**
   * Implements Tableau WDC init().gulp
   *
   * @param {function} [cb]
   *  Callback function.
   */
  init(cb) {
    const accessToken = Cookies.get("accessToken") || false,
      hasAccessToken = (accessToken && accessToken !== 'undefined' && accessToken.length > 0) ||
        tableau.password.length > 0;

    // Set the authentication method to custom.
    tableau.authType = tableau.authTypeEnum.custom;

    if (tableau.phase === tableau.phaseEnum.gatherDataPhase) {
      // Initialize our Github API.
      this._requestType = this.getConnectionData('dataType');
      gh = Github.create(this._requestType, this._getAuthentication());

      // Validate access token.
      gh.getRateLimit().catch((err) => {
        tableau.log("Invalid accessToken.");
        tableau.abortForAuth();
      });
    }

    // Update the UI to reflect the authentication status.
    $(document).trigger('updateUI', hasAccessToken);

    cb();

    switch (tableau.phase) {
      case tableau.phaseEnum.authPhase:
        if (hasAccessToken) {
          tableau.password = accessToken;
          // Auto-submit.
          tableau.submit();
        }
        break;
      case tableau.phaseEnum.interactivePhase:
        if (hasAccessToken) {
          tableau.password = accessToken;
        }
        break;
    }
  }

  /**
   * Returns the authentication for Github.
   *
   * @returns {{username: *, password: *, token: *}}
   * @private
   */
  _getAuthentication() {
    return {
      username: tableau.username,
      password: tableau.password,
      token: tableau.password,
    };
  }

  /**
   * Return the connection data, or a specific property from, of the Tableau
   * WDC connection data.
   *
   * @param {string} [prop]
   *  Optional property name to retrieve the value for.
   */
  getConnectionData(prop = null) {
    const connectionData = JSON.parse(tableau.connectionData || "{}");

    if (prop && _.has(connectionData, prop)) {
      return connectionData[prop];
    }
    else {
      return connectionData;
    }
  }

  /**
   * Implements Tableau WDC getSchema().
   *
   * @param {function}[cb]
   *  Callback function.
   */
  getSchema(cb) {
    // Add schema objects to array of promises.
    gh.getSchema().then((schema) => {
      cb(schema['tables'], schema['joins']);
    });
  }

  /**
   * Implements Tableau WDC getData().
   *
   * @param table
   * @param {function} [cb]
   *  Callback function.
   */
  getData(table, cb) {
    const dataType = this.getConnectionData('dataType');
    const isGraphqlV4 = !!dataType.match(/_v4$/);
    const tableId = table.tableInfo.id;

    if(_.has(this._cache, tableId)) {
      table.appendRows(this._cache[tableId]);
      cb();
    }
    else if (isGraphqlV4) {
      const connectionData = this.getConnectionData();
      gh.graphql(connectionData)
        .then(rawData => {
          return gh.processData(this._cache, table, rawData);
        }).then(processedData => {
          this._cache = processedData;
          return Promise.resolve(true);
        }).then(() => {
          table.appendRows(this._cache[tableId]);
          cb();
        }).catch((err) => {
          tableau.abortWithError(err);
      });
    }
    else {
      const query = this.getConnectionData('query');
      const urls = gh.parseUrl(query.split('?')[0], tableId),
        options = getUrlParams(query.split('?')[1]);

      gh
        .getData(urls, options, 5)
        .then((rawData) => {
          return gh.processData(this._cache, table, rawData);
      }).then((processedData) => {
          this._cache = processedData;
          return Promise.resolve(true);
      }).then(() => {
          table.appendRows(this._cache[tableId]);
          cb();
      }).catch((err) => {
          tableau.abortWithError(err);
      });
    }
  }

  /**
   * Implements Tableau WDC shutdown().
   *
   * @param cb
   */
  shutdown(cb) {
    // Clear cache
    this._cache = {};
    cb();
  }

}

module.exports = GithubWDC;

// Private helper functions.

/**
 * Retrieve query parameters from a given query string.
 *
 * @param {string} [queryString]
 * @returns {{}}
 */
function getUrlParams(queryString = '') {
  const options = queryString ? queryString.split('&') : [],
    result = {};

  options.map(option => {
    let [key, val] = option.split('=');
    result[key] = decodeURIComponent(val)
  });

  return result;
}
