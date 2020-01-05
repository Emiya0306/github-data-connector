import GithubObject from './GithubObject';
import $ from 'jquery';
import _ from 'lodash';
import debug from 'debug';

const log = debug('issues');

/**
 * Make simple API calls to the Github API.
 */
class IssuesV4 extends GithubObject {

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
    super(auth, base);
  }

  /**
   * Returns the relevant Github schema objects for issues.
   *
   * @return {Promise}
   *  Promise of schema object.
   */
  getSchema() {
    const schema = {
      'tables': [],
      'joins': [],
    };

    return new Promise((resolve, reject) => {
      const tablePromises = [
        Promise.resolve($.getJSON('/github/schema/issues_v4.json')),
        Promise.resolve($.getJSON('/github/schema/comments_v4.json')),
        Promise.resolve($.getJSON('/github/schema/issue_comments_v4.json')),
        Promise.resolve($.getJSON('/github/schema/users_v4.json')),
        Promise.resolve($.getJSON('/github/schema/milestones.json')),
        Promise.resolve($.getJSON('/github/schema/assignees_v4.json')),
        Promise.resolve($.getJSON('/github/schema/labels.json')),
        Promise.resolve($.getJSON('/github/schema/assigned_labels.json'))],
        joinPromises = Promise.resolve($.getJSON('/github/schema/_issues_joins_v4.json'));

      Promise.all(tablePromises).then((tables) => {
        schema.tables = tables;

        return joinPromises;
      }).then((joins) => {
        schema.joins = joins;

        resolve(schema);
      });
    });
  }

  /**
   * Process our issues into a format that is more Tableau friendly.
   * Isolate nested objects and arrays (e.g. user, assignees, labels and milestone)
   * and store them in separate 'tables'.
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
    result = _.assignIn(result, {
      'assigned_labels': [],
      'assignees': [],
      'issues': [],
      'labels': [],
      'milestones': [],
      'users': [],
      'comments': [],
      'issue_comments': []
    });

    return new Promise((resolve, reject) => {
      // Isolate objects and arrays to make joins easier in Tableau.
      _.forEach(rawData, (obj) => {
        // Assignees.
        if (_.has(obj, 'assignees') && obj.assignees.length > 0) {
          _.forEach(obj.assignees, (assignee) => {
            if(!_.find(result.users, {id: assignee.id})) {
              result['users'].push(assignee);
            }

            result['assignees'].push({
              'parent_id': obj.id,
              'user_id': assignee.id,
            });
          });
        }

        // Labels.
        if (_.has(obj, 'labels') && obj.labels.length > 0) {
          _.forEach(obj.labels, (label) => {
            if(!_.find(result.labels, {id: label.id})) {
              result['labels'].push(label);
            }

            result['assigned_labels'].push({
              'parent_id': obj.id,
              'label_id': label.id,
            });
          });
        }

        // Milestones.
        if (_.has(obj, 'milestone') && obj.milestone) {
          const milestone = obj.milestone;
          obj.milestone_id = milestone.id;

          // Handle milestone creators.
          if (_.has(milestone, 'creator') && milestone.creator) {
            const user = milestone.creator;
            milestone.user_id = user.id;

            if(!_.find(result.users, {id: milestone.user_id})) {
              result['users'].push(user);
            }
          }

          if(!_.find(result.milestones, {id: milestone.id})) {
            result['milestones'].push(milestone);
          }
        }

        // Users.
        if (_.has(obj, 'user') && obj.user) {
          const user = obj.user;
          obj.user_id = user.id;

          if(!_.find(result.users, {id: user.id})) {
            result['users'].push(user);
          }
        }

        // Comments.
        if (_.has(obj, 'comments') && obj.comments.length > 0) {
          _.forEach(obj.comments, (comment) => {
            if(!_.find(result.comments, {id: comment.id})) {
              result['comments'].push(comment);
            }

            result['issue_comments'].push({
              'parent_id': obj.id,
              'comment_id': comment.id,
            });
          });
        }

        // Issue data.
        if(!_.find(result.issues, {id: obj.id})) {
          result.issues.push(obj);
        }
      });

      resolve(result);
    });
  }

  getQuery({ owner, repository, cursor }) {
    const after = cursor ? `after:"${cursor}"` : '';
    const issueProps = 'body closed closedAt createdAt databaseId id lastEditedAt locked number publishedAt resourcePath state url title updatedAt';
    const userProps = 'createdAt databaseId id isSiteAdmin location login name resourcePath updatedAt avatarUrl url';
    const labelProps = 'id name description url createdAt color isDefault';
    const commentProps = 'id body createdAt databaseId lastEditedAt publishedAt updatedAt url';
    const milestoneProps = 'closed closedAt createdAt description dueOn id number state title updatedAt url';
    // TODO: 增加pullRequest

    return `
      query {
        repository(owner:"${owner}", name:"${repository}") {
          issues(first:100 ${after}) {
            edges {
              node {
                ${issueProps}
                author {
                  ...on User {
                    ${userProps}
                  }
                }
                repository {
                  url
                  name
                }
                milestone {
                  ${milestoneProps}
                  creator {
                    ...on User {
                      ${userProps}
                    }
                  }
                }
                labels(first: 100) {
                  nodes {
                    ${labelProps}
                  }
                }
                comments(first: 100) {
                  nodes {
                    ${commentProps}
                    author {
                      ...on User {
                        ${userProps}
                      }
                    }
                    editor {
                      ...on User {
                        ${userProps}
                      }
                    }
                  }
                }
                assignees(first: 100) {
                  nodes {
                    ${userProps}
                  }
                }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    `;
  }

  formatResponse(response) {
    try {
      const data = [];
      const { edges: results, pageInfo } = response.body.data.repository.issues;

      for (const { node: result } of results) {
        const assignees = result.assignees.nodes;
        const comments = result.comments.nodes;
        const labels = result.labels.nodes;

        data.push({
          id: result.id,
          database_id: result.databaseId,
          url: result.url,
          repository_url: result.repository.url,
          resource_path: result.resourcePath,
          number: result.number,
          state: result.state,
          title: result.title,
          body: result.body,
          locked: result.locked,
          closed: result.closed,
          user_id: result.author && result.author.id,
          repo_name: result.repository.name,
          closed_at: result.closedAt,
          created_at: result.createdAt,
          updated_at: result.updatedAt,
          last_edited_at: result.lastEditedAt,
          published_at: result.publishedAt,
          milestone: result.milestone,
          author: result.author,
          assignees,
          comments,
          labels,
        });
      }

      if (pageInfo.hasNextPage) {
        const nextCursor = pageInfo.endCursor;
        return { data, nextCursor };
      }

      return { data };
    } catch (e) {
      console.log(e);
    }
  }
}

export default IssuesV4;


// Private helper functions.
