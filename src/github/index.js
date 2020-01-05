"use strict";

//import 'babel-polyfill';
import _ from 'lodash';
import GithubWDC from './GithubWDC';

const wdc = new GithubWDC();
tableau.registerConnector(wdc);

(function ($) {
  $(document).ready(function () {
    const $inputFields = $('input, select, textarea').not('[type="submit"]');

    // Set default values (base on connection data).
    setFieldsFromValues($inputFields, wdc.getConnectionData());

    // Handles Github OAuth.
    $("#authenticate").click(oAuthRedirect);

    // Handles data-type examples.
    $('select[name=dataType]').change(function() {
      const dataType = $(this).val();

      // Show examples
      $('#help > div').hide();
      $('#help-' + dataType).show();
      showInputForm();
    });

    // Handles WDC submission.
    $('form').submit(function connectorFormSubmitHandler(e) {
      e.preventDefault();

      // Retrieve connection data from input fields.
      const data = getValuesFromFields($inputFields);

      // Initiate the data retrieval process.
      tableau.connectionName = "Github WDC";
      tableau.connectionData = JSON.stringify(data);
      tableau.submit();
    });

    showInputForm();
  });

  /**
   * Update the UI depending on whether the user has authenticated.
   *
   * @param {bool}[isAuthenticated]
   *  TRUE if the user is authenticated, FALSE otherwise.
   */
  $(document).on('updateUI', function (e, isAuthenticated) {
    if (isAuthenticated) {
      $(".anonymous").hide();
      $(".authenticated").show();
    } else {
      $(".anonymous").show();
      $(".authenticated").hide();
    }
  });

  /**
   * Perform Github OAuth,
   */
  function oAuthRedirect() {
    window.location.href = '/github/login/oauth';
  }

  function showInputForm() {
    const dataType = $("#data-type-issues").val();
    const isGraphqlV4 = !!dataType.match(/_v4$/);

    if (isGraphqlV4) {
      $('#api_v3').hide();
      $('#graphql_v4').show();
    } else {
      $('#api_v3').show();
      $('#graphql_v4').hide();
    }
  }

  /**
   * Set default field values.
   *
   * @param $fields
   *  Fields to iterate over.
   * @param {object}[data]
   *  Values to assign.
   */
  function setFieldsFromValues($fields, data) {
    $fields.each(function (index, value) {
      const $field = $(this),
        name = $field.attr('name'),
        type = $field.attr('type');

      if (_.has(data, name)) {
        switch (type) {
          case 'radio':
            $field.is(':checked');
            break;
          default:
            $field.val(data[name]);
            break;
        }
      }
    });
  }

  /**
   * Retrieve a list of field values by field name.
   * @param $fields
   *  Fields to iterate over.
   */
  function getValuesFromFields($fields) {
    const data = {};

    $fields.each(function (index, value) {
      const $field = $(this),
        name = $field.attr('name'),
        type = $field.attr('type');

      switch (type) {
        case 'radio':
          if ($field.is(':checked')) {
            data[name] = $field.val();
          }
          break;
        default:
          data[name] = $field.val();
          break;
      }
    });

    return data;
  }

})(jQuery);
