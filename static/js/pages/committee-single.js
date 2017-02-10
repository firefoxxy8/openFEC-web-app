'use strict';

/* global document, context */

var $ = require('jquery');
var _ = require('underscore');

var events = require('fec-style/js/events');

var maps = require('../modules/maps');
var tables = require('../modules/tables');
var filings = require('../modules/filings');
var helpers = require('../modules/helpers');
var columnHelpers = require('../modules/column-helpers');
var columns = require('../modules/columns');
var dropdown = require('fec-style/js/dropdowns');

var tableOpts = {
  dom: tables.simpleDOM,
  pagingType: 'simple',
  lengthChange: true,
  lengthMenu: [10, 50, 100],
  pageLength: 10,
  hideEmpty: true,
  aggregateExport: true
};

var sizeColumns = [
  {
    data: 'size',
    width: '50%',
    className: 'all',
    orderable: false,
    render: function(data, type, row, meta) {
      return columnHelpers.sizeInfo[data].label;
    }
  },
  {
    data: 'total',
    width: '50%',
    className: 'all',
    orderSequence: ['desc', 'asc'],
    orderable: false,
    render: columnHelpers.buildTotalLink(['receipts', 'individual-contributions'], function(data, type, row, meta) {
      return columnHelpers.getSizeParams(row.size);
    })
  }
];

var committeeColumns = [
  {
    data: 'committee_name',
    className: 'all',
    orderable: false,
    render: function(data, type, row, meta) {
      return columnHelpers.buildEntityLink(
        data,
        helpers.buildAppUrl(['committee', row.committee_id]),
        'committee'
      );
    }
  },
  {
    data: 'total',
    className: 'all',
    orderable: false,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['disbursements'], function(data, type, row, meta) {
      return {
        committee_id: row.committee_id,
        recipient_name: row.recipient_id
      };
    })
  }
];

var stateColumns = [
  {
    data: 'state_full',
    width: '50%',
    className: 'all',
    render: function(data, type, row, meta) {
      var span = document.createElement('span');
      span.textContent = data;
      span.setAttribute('data-state', data);
      span.setAttribute('data-row', meta.row);
      return span.outerHTML;
    }
  },
  {
    data: 'total',
    width: '50%',
    className: 'all',
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['receipts', 'individual-contributions'], function(data, type, row, meta) {
      return {
        contributor_state: row.state,
      };
    })
  },
];

var employerColumns = [
  {data: 'employer', className: 'all', orderable: false, defaultContent: 'NOT REPORTED'},
  {
    data: 'total',
    className: 'all',
    orderable: false,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['receipts', 'individual-contributions'], function(data, type, row, meta) {
      if (row.employer) {
        return {
          contributor_employer: row.employer,
        };
      } else {
        return null;
      }
    })
  }
];

var occupationColumns = [
  {data: 'occupation', className: 'all', orderable: false, defaultContent: 'NOT REPORTED'},
  {
    data: 'total',
    className: 'all',
    orderable: false,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['receipts', 'individual-contributions'], function(data, type, row, meta) {
      if (row.occupation) {
        return {
          contributor_occupation: row.occupation,
        };
      } else {
        return null;
      }
    })
  }
];

var disbursementPurposeColumns = [
  {data: 'purpose', className: 'all', orderable: false},
  {
    data: 'total',
    className: 'all',
    orderable: false,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['disbursements'], function(data, type, row, meta) {
      return {disbursement_purpose_categories: row.purpose.toLowerCase()};
    })
  }
];

var disbursementRecipientColumns = [
  {data: 'recipient_name', className: 'all', orderable: false},
  {
    data: 'total',
    className: 'all',
    orderable: false,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['disbursements'], function(data, type, row, meta) {
      return {recipient_name: row.recipient_name};
    })
  }
];

var disbursementRecipientIDColumns = [
  {
    data: 'recipient_name',
    className: 'all',
    orderable: false,
    render: function(data, type, row, meta) {
      return columnHelpers.buildEntityLink(
        data,
        helpers.buildAppUrl(['committee', row.recipient_id]),
        'committee'
      );
    }
  },
  {
    data: 'total',
    className: 'all',
    orderable: false,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['disbursements'], function(data, type, row, meta) {
      return {recipient_name: row.recipient_id};
    })
  }
];

var expendituresColumns = [
  {
    data: 'total',
    className: 'all',
    orderable: true,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['independent-expenditures'], function(data, type, row, meta) {
      return {
        support_oppose_indicator: row.support_oppose_indicator,
        candidate_id: row.candidate_id,
        // is_notice: false,
      };
    })
  },
  columns.supportOpposeColumn,
  columns.candidateColumn({data: 'candidate', className: 'all'})
];

var electioneeringColumns = [
  {
    data: 'total',
    className: 'all',
    orderable: true,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['electioneering-communications'], function(data, type, row, meta) {
      return {
        support_oppose_indicator: row.support_oppose_indicator,
        candidate_id: row.candidate_id,
      };
    })
  },
  columns.candidateColumn({data: 'candidate', className: 'all'})
];

var communicationCostColumns = [
  {
    data: 'total',
    className: 'all',
    orderable: true,
    orderSequence: ['desc', 'asc'],
    render: columnHelpers.buildTotalLink(['communication-costs'], function(data, type, row, meta) {
      return {
        support_oppose_indicator: row.support_oppose_indicator,
        candidate_id: row.candidate_id,
      };
    })
  },
  columns.supportOpposeColumn,
  columns.candidateColumn({data: 'candidate', className: 'all'})
];

function buildStateUrl($elm) {
  return helpers.buildUrl(
    ['committee', $elm.data('committee-id'), 'schedules', 'schedule_a', 'by_state'],
    {cycle: $elm.data('cycle'), per_page: 99}
  );
}

function highlightRowAndState($map, $table, state, scroll) {
  var $scrollBody = $table.closest('.dataTables_scrollBody');
  var $row = $scrollBody.find('span[data-state="' + state + '"]');

  if ($row.length > 0) {
    maps.highlightState($('.state-map'), state);
    $scrollBody.find('.row-active').removeClass('row-active');
    $row.parents('tr').addClass('row-active');
    if (scroll) {
      $scrollBody.animate({
        scrollTop: $row.closest('tr').height() * parseInt($row.attr('data-row'))
      }, 500);
    }
  }

}

var aggregateCallbacks = {
  afterRender: tables.barsAfterRender.bind(undefined, undefined),
};

// Settings for filings tables

var filingsColumns = columnHelpers.getColumns(
  columns.filings,
  ['document_type', 'version', 'receipt_date']
);

var filingsReportsColumns = columnHelpers.getColumns(
  columns.filings,
  ['document_type', 'version', 'receipt_date', 'modal_trigger']
);

$(document).ready(function() {
  // Set up data tables
  $('.data-table').each(function(index, table) {
    var $table = $(table);
    var committeeId = $table.attr('data-committee');
    var cycle = $table.attr('data-cycle');
    var query = {cycle: cycle};
    var path,
        opts;
    var filingsOpts = {
      autoWidth: false,
      rowCallback: filings.renderRow,
      dom: '<"panel__main"t><"results-info"frlpi>',
      pagingType: 'simple',
      lengthMenu: [100, 10],
      drawCallback: function () {
        this.dropdowns = $table.find('.dropdown').map(function(idx, elm) {
          return new dropdown.Dropdown($(elm), {checkboxes: false});
        });
      }
    };
    switch ($table.attr('data-type')) {
    case 'committee-contributor':
      path = ['schedules', 'schedule_b', 'by_recipient_id'];
      tables.DataTable.defer($table, {
        path: path,
        query: _.extend({recipient_id: committeeId}, query),
        columns: committeeColumns,
        callbacks: aggregateCallbacks,
        dom: tables.simpleDOM,
        order: [[1, 'desc']],
        pagingType: 'simple',
        lengthChange: true,
        pageLength: 10,
        lengthMenu: [10, 50, 100],
        aggregateExport: true,
        hideEmpty: true,
        hideEmptyOpts: {
          dataType: 'disbursements received from other committees',
          name: context.name,
          timePeriod: context.timePeriod
        }
      });
      break;
    case 'contribution-size':
      path = ['committee', committeeId, 'schedules', 'schedule_a', 'by_size'];
      tables.DataTable.defer($table, {
        path: path,
        query: query,
        columns: sizeColumns,
        callbacks: aggregateCallbacks,
        dom: 't',
        order: false,
        pagingType: 'simple',
        lengthChange: false,
        pageLength: 10,
        aggregateExport: true,
        hideEmpty: true,
        hideEmptyOpts: {
          dataType: 'individual contributions',
          name: context.name,
          timePeriod: context.timePeriod
        }
      });
      break;
    case 'receipts-by-state':
      path = ['committee', committeeId, 'schedules', 'schedule_a', 'by_state'];
      query = _.extend(query, {per_page: 99});
      tables.DataTable.defer($table, {
        path: path,
        query: query,
        columns: stateColumns,
        callbacks: aggregateCallbacks,
        aggregateExport: true,
        dom: 't',
        order: [[1, 'desc']],
        paging: false,
        scrollY: 400,
        scrollCollapse: true
      });
      events.on('state.map', function(params) {
        var $map = $('.state-map');
        highlightRowAndState($map, $table, params.state, true);
      });
      $table.on('click', 'tr', function() {
        events.emit('state.table', {
          state: $(this).find('span[data-state]').attr('data-state')
        });
      });
      break;
    case 'receipts-by-employer':
      path = ['committee', committeeId, 'schedules', 'schedule_a', 'by_employer'];
      tables.DataTable.defer(
        $table,
        _.extend({}, tableOpts, {
          path: path,
          query: query,
          columns: employerColumns,
          callbacks: aggregateCallbacks,
          order: [[1, 'desc']],
          hideEmptyOpts: {
            dataType: 'individual contributions',
            name: context.name,
            timePeriod: context.timePeriod
          },
        })
      );
      break;
    case 'receipts-by-occupation':
      path = ['committee', committeeId, 'schedules', 'schedule_a', 'by_occupation'];
      tables.DataTable.defer(
        $table,
        _.extend({}, tableOpts, {
          path: path,
          query: query,
          columns: occupationColumns,
          callbacks: aggregateCallbacks,
          order: [[1, 'desc']],
          hideEmptyOpts: {
            dataType: 'individual contributions',
            name: context.name,
            timePeriod: context.timePeriod
          },
        })
      );
      break;
    case 'disbursements-by-purpose':
      path = ['committee', committeeId, 'schedules', 'schedule_b', 'by_purpose'];
      tables.DataTable.defer(
        $table,
        _.extend({}, tableOpts, {
          path: path,
          query: query,
          columns: disbursementPurposeColumns,
          callbacks: aggregateCallbacks,
          order: [[1, 'desc']],
          hideEmptyOpts: {
            dataType: 'disbursements',
            name: context.name,
            timePeriod: context.timePeriod
          },
        })
      );
      break;
    case 'disbursements-by-recipient':
      path = ['committee', committeeId, 'schedules', 'schedule_b', 'by_recipient'];
      tables.DataTable.defer(
        $table,
        _.extend({}, tableOpts, {
          path: path,
          query: query,
          columns: disbursementRecipientColumns,
          callbacks: aggregateCallbacks,
          order: [[1, 'desc']],
          hideEmptyOpts: {
            dataType: 'disbursements',
            name: context.name,
            timePeriod: context.timePeriod
          },
        })
      );
      break;
    case 'disbursements-by-recipient-id':
      path = ['committee', committeeId, 'schedules', 'schedule_b', 'by_recipient_id'];
      tables.DataTable.defer(
        $table,
        _.extend({}, tableOpts, {
          path: path,
          query: query,
          columns: disbursementRecipientIDColumns,
          callbacks: aggregateCallbacks,
          order: [[1, 'desc']],
          hideEmptyOpts: {
            dataType: 'disbursements to committees',
            name: context.name,
            timePeriod: context.timePeriod
          },
        })
      );
      break;
    case 'independent-expenditure-committee':
      path = ['committee', committeeId, 'schedules', 'schedule_e', 'by_candidate'];
      tables.DataTable.defer($table, {
        path: path,
        query: query,
        columns: expendituresColumns,
        order: [[0, 'desc']],
        dom: tables.simpleDOM,
        pagingType: 'simple',
        hideEmpty: true,
        hideEmptyOpts: {
          dataType: 'independent expenditures',
          name: context.name,
          timePeriod: context.timePeriod
        },
      });
      break;
    case 'electioneering-committee':
      path = ['committee', committeeId, 'electioneering', 'by_candidate'];
      tables.DataTable.defer($table, {
        path: path,
        query: query,
        columns: electioneeringColumns,
        order: [[0, 'desc']],
        dom: tables.simpleDOM,
        pagingType: 'simple',
        hideEmpty: true,
        hideEmptyOpts: {
          dataType: 'electioneering communications',
          name: context.name,
          timePeriod: context.timePeriod
        },
      });
      break;
    case 'communication-cost-committee':
      path = ['committee', committeeId, 'communication_costs', 'by_candidate'];
      tables.DataTable.defer($table, {
        path: path,
        query: query,
        columns: communicationCostColumns,
        order: [[0, 'desc']],
        dom: tables.simpleDOM,
        pagingType: 'simple',
        hideEmpty: true,
        hideEmptyOpts: {
          dataType: 'communication costs',
          name: context.name,
          timePeriod: context.timePeriod
        },
      });
      break;
    case 'filings-reports':
      opts = _.extend({
        columns: filingsReportsColumns,
        path: ['committee', committeeId, 'filings'],
        query: _.extend({
            form_type: ['F3', 'F3X', 'F3P', 'F3L', 'F4', 'F7', 'F13', 'RFAI'],
            sort: ['-coverage_end_date', 'report_type_full', '-beginning_image_number']
          }, query),
        callbacks: {
          afterRender: filings.renderModal
        }
      }, filingsOpts);
      tables.DataTable.defer($table, opts);
      break;
    case 'filings-notices':
      opts = _.extend({
        columns: filingsColumns,
        order: [[2, 'desc']],
        path: ['committee', committeeId, 'filings'],
        query: _.extend({form_type: ['F5', 'F24', 'F6', 'F9', 'F10', 'F11']}, query),
      }, filingsOpts);
      tables.DataTable.defer($table, opts);
      break;
    case 'filings-statements':
      opts = _.extend({
        columns: filingsColumns,
        order: [[2, 'desc']],
        path: ['committee', committeeId, 'filings'],
        query: _.extend({form_type: ['F1']}, query),
      }, filingsOpts);
      tables.DataTable.defer($table, opts);
      break;
    case 'filings-other':
      opts = _.extend({
        columns: filingsColumns,
        order: [[2, 'desc']],
        path: ['committee', committeeId, 'filings'],
        query: _.extend({form_type: ['F1M', 'F8', 'F99', 'F12']}, query),
      }, filingsOpts);
      tables.DataTable.defer($table, opts);
      break;
    }
  });

  // Set up state map
  var $map = $('.state-map');
  var url = buildStateUrl($map);
  $.getJSON(url).done(function(data) {
    maps.stateMap($map, data, 400, 300, null, null, true, true);
  });
  events.on('state.table', function(params) {
    highlightRowAndState($map, $('.data-table'), params.state, false);
  });
  $map.on('click', 'path[data-state]', function() {
    var state = $(this).attr('data-state');
    events.emit('state.map', {state: state});
  });
});
