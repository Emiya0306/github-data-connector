import {Base64} from 'js-base64';
import PromisePool from 'es6-promise-pool';
import $ from 'jquery';
import req from 'request-promise';
import debug from 'debug';

const log = debug('github');

/**
 * Make simple API calls to the Github API.
 */
class GithubObject {
  /**
   * Either a username and password or an oauth token for Github.
   * @typedef {Object} GithubObject.auth
   * @prop {string} [username]
   *  The Github username.
   * @prop {string} [password]
   *  The user's password.
   * @prop {token} [token]
   *  An OAuth token.
   */

  /**
   * Initialize our Github API.
   *
   * @param {Github.auth} [auth]
   *  The credentials used to authenticate with Github. If not provided
   *  requests will be made unauthenticated.
   * @param {string} [base]
   *  The base of the API url.
   */
  constructor(auth, base) {
    this._base = base;
    this._auth = auth;

    if (auth.token) {
      this._auth.header = 'token ' + auth.token;
    } else if (auth.username && auth.password) {
      this._auth.header= 'Basic ' + Base64.encode(auth.username + ':' + auth.password);
    }
  }

  /**
   * Make a request to Github to fetch the ratelimit(s).
   *
   * @return {Promise)
   *  The Promise for the rate limit request.
   */
  getRateLimit() {
    const url = this._base + 'rate_limit';
    return this._request(url);
  }

  /**
   * Get the headers required for an API request.
   *
   * @return {Object}
   *  The headers to pass to the request.
   */
  _getRequestHeaders() {
    const headers = {
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/vnd.github.v3+json',
    };

    if (this._auth.header) {
      headers.Authorization = this._auth.header;
    }

    return headers;
  }

  /**
   * Sets the default options for API requests
   *
   * @return {Object}
   *  Additional options to pass to the request.
   */
  _getRequestOptions(options) {
    options = Object.assign({
      sort: 'updated',
      per_page: '5000',
    }, options);

    return options;
  }

  /**
   * Returns the relevant Github schema objects for a given type.
   *
   * @return {Promise}
   *  Promise of schema object.
   */
  getSchema() {
    throw new Error('You have to implement this abstract method!');
  }

  /**
   * Parse query into useful API request urls.
   *
   * @param {string} [url]
   *  Request URI relative to the API base.
   * @param {string} [tableId]
   *  The table identifier.
   * @return {Array}
   *  Array of urls.
   */
  parseUrl(url, tableId) {
    const base = 'https://api.github.com/',
      re = /\[(.*)\]/g,
      match = re.exec(url),
      urls = [];

    // Look for any arrays in our query string.
    if (match !== null) {
      const delimited = match[1].split(',');

      for(const value of delimited) {
        urls.push(base + url.replace(re, value));
      }
    } else {
      urls.push(base + url);
    }

    return urls;
  }

  /**
   * Concurrently runs API requests for a number of given urls.
   *
   * @param {array}(urls)
   *  A list of urls to call using the API.
   * @param {*} [options]
   *  Additional options will be sent as query parameters.
   * @param {number}(concurrency)
   *  The number of concurrent API calls we can make.
   *
   * @returns {Promise}
   * @private
   */
  getData(urls, options = {}, concurrency = 5) {
    return new Promise((resolve, reject) => {
      let count = 0,
        producer,
        pool,
        raw = [];

      // A Promise Pool producer generates promises as long as there is work left
      // to be done. We return null to notify the pool is empty.
      producer = () => {
        if (count < urls.length) {
          let url = urls[count];
          count++;

          // The actual API request for a given url.
          return new Promise((resolve, reject) => {
            this._request(url, options).then((result) => {
              // Append all our raw data.
              raw = raw.concat(...result);

              resolve(raw);
            }).catch((err) => {
              reject('Invalid Github API request: ' + url);
            });
          });
        }
        else {
          return null;
        }
      };

      // Run our promises concurrently, but never exceeds the maximum number of
      // concurrent promises.
      pool = new PromisePool(producer, concurrency);
      pool.start().then(() => {
        resolve(raw);
      }, (err) => {
        reject(err);
      });
    });
  }

  /**
   * Make a request and fetch all available data (support pagination).
   *
   * @param {string} [url]
   *  The url for the API request.
   * @param {*} [options]
   *  Additional options will be sent as query parameters.
   * @param {Object[]} [results]
   *  For internal use only - recursive requests.
   *
   * @return {Promise}
   *  The Promise for the http request
   */
  _request(url, options = {}, results = []) {
    const config = {
      url: url,
      method: 'GET',
      headers: this._getRequestHeaders(),
      qs: this._getRequestOptions(options),
      responseType: 'json',
      resolveWithFullResponse: true,
      json: true,
    };

    return req(config).then((response) => {
      if (response.body instanceof Array) {
        // Default GET Github API requests.
        results.push(...response.body);
      }
      else if (response.body instanceof Object) {
        // Default single GET Github API requests.
        results.push(response.body);
      }
      else if (response.body.items instanceof Array) {
        // Support SEARCH Github API requests.
        // @link https://developer.github.com/v3/search/
        results.push(...response.body.items);
      }
      else {
        log('reject');
      }

      // Support Github pagination.
      if (response.headers.link) {
        const nextPage = getNextPage(response.headers.link);
        if (nextPage) {
          return this._request(nextPage, options, results);
        }
      }

      // Include request url to all result objects.
      results.forEach((element) => {
        element._request_url = url;
      });

      return results;
    }).catch(function (err) {
      log(err);
      throw err;
    });
  }

  /**
   * Process our objects into a format that is more Tableau friendly.
   * Isolate nested objects and arrays and store them in separate 'tables'.
   *
   * @param {Object} [result]
   *  An object where you wish to save the processed data onto.
   * @param {Object} [table]
   *  Table object which contains information about the columns and values.
   * @param {Array} [rawData]
   *  An array of objects to process.
   * @returns {Promise}
   */
  processData(result, table, rawData) {
    const tableId = table.tableInfo.id;
    result[tableId] = rawData;

    return result;
  }

  delayMs(func) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        func().then(resolve).catch(reject);
      }, 1000);
    });
  }

  graphql(queryObj, results = []) {
    const authHeader = this._auth.header;
    const token = authHeader && authHeader.replace('token ', '') || '';
    const query = this.getQuery(queryObj);

    const configs = {
      url: 'https://api.github.com/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: token ? `bearer ${token}` : null,
      },
      responseType: 'json',
      resolveWithFullResponse: true,
      json: true,
      body: { query },
    };

    return req(configs)
      .then(response => {
        const { data, nextCursor } = this.formatResponse(response);

        if (data instanceof Array) {
          results.push(...data);

          if (nextCursor) {
            const newQueryObj = Object.assign({}, queryObj, { cursor: nextCursor });

            return this.delayMs(() => {
              return this.graphql(newQueryObj, results);
            });
          }
        }

        return results;
      });
  }
}

export default GithubObject;


// Private helper functions.

/**
 * Gets a url to the next page of the result set.
 *
 * @param {string} link
 *  The meta data 'link' from our response header.
 * @returns {*}
 *  The url to our next page, or undefined if no next page was found.
 */
function getNextPage(link) {
  const links = {};

  link.replace(/<([^>]*)>;\s*rel="([\w]*)\"/g, function(m, uri, type) {
    links[type] = uri;
  });

  return links.next;
}
