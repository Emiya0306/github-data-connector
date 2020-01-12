import GithubObject from './GithubObject';
import Issues from './Issues';
import IssuesV4 from './IssuesV4';
import Pulls from './Pulls';
import Traffic from './Traffic';

"use strict";

const ISSUE = 'issues';
const ISSUE_V4 = 'issues_v4';
const PULL_REQUEST = 'pulls';
const TRAFFIC = 'traffic';

/**
 * Factory.
 */
const Github = {

  create(type, auth = {}, base = 'https://api.github.com/') {
    switch (type) {
      case ISSUE:
        return new Issues(auth, base);
      case ISSUE_V4:
        return new IssuesV4(auth, base);
      case PULL_REQUEST:
        return new Pulls(auth, base);
      case TRAFFIC:
        return new Traffic(auth, base);
      default:
        return new GithubObject(auth, base);
    }
  }
};

export default Github;

// Private helper functions.
