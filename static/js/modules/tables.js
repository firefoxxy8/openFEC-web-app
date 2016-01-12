'use strict';

var $ = require('jquery');
var _ = require('underscore');

var tabs = require('../vendor/tablist');

var urls = require('fec-style/js/urls');
var accessibility = require('fec-style/js/accessibility');
var analytics = require('fec-style/js/analytics');

require('datatables');
require('drmonty-datatables-responsive');

var helpers = require('./helpers');
var download = require('./download');

var exportWidgetTemplate = require('../../templates/tables/exportWidget.hbs');
var titleTemplate = require('../../templates/tables/title.hbs');

var simpleDOM = 't<"results-info"ip>';
var browseDOM = '<"js-results-info results-info results-info--top"' +
                  '<"results-info__right"ilpr>>' +
                '<"panel__main"t>' +
                '<"results-info"ip>';

var DOWNLOAD_CAP = 100000;
var MAX_DOWNLOADS = 5;
var DOWNLOAD_MESSAGES = {
  recordCap:
    'Exports are limited to ' +
    DOWNLOAD_CAP +
    ' records—add filters to narrow results, or export bigger ' +
    'data sets with <a href="http://www.fec.gov/data/DataCatalog.do?cf=downloadable" target="_blank">FEC bulk data exporter</a>.',
  downloadCap: 'Each user is limited to ' +
    MAX_DOWNLOADS +
    ' exports at a time. This helps us keep things running smoothly.',
  comingSoon: 'Data exports for this page are coming soon.',
  pending: 'You\'re already exporting this data set.'
};

// Only show table after draw
$(document.body).on('draw.dt', function() {
  $('.data-container__body.fade-in').css('opacity', '1');
  $('.dataTable tbody td:first-child').attr('scope','row');
});

function yearRange(first, last) {
  if (first === last) {
    return first;
  } else {
    return first.toString() + ' - ' + last.toString();
  }
}

function getCycle(value, meta) {
  var dataTable = DataTable.registry[meta.settings.sTableId];
  var filters = dataTable && dataTable.filters;
  if (filters && filters.cycle) {
    var cycles = _.intersection(
      _.map(filters.cycle, function(cycle) { return parseInt(cycle); }),
      value
    );
    return cycles.length ?
      {cycle: _.max(cycles)} :
      {};
  } else {
    return {};
  }
}

function buildEntityLink(data, url, category, opts) {
  opts = opts || {};
  var anchor = document.createElement('a');
  anchor.textContent = data;
  anchor.setAttribute('href', url);
  anchor.setAttribute('title', data);
  anchor.setAttribute('data-category', category);
  anchor.classList.add('single-link');

  if (opts.isIncumbent) {
    anchor.classList.add('is-incumbent');
  }

  return anchor.outerHTML;
}

function buildAggregateUrl(cycle) {
  var dates = helpers.cycleDates(cycle);
  return {
    min_date: dates.min,
    max_date: dates.max
  };
}

function buildTotalLink(path, getParams) {
  return function(data, type, row, meta) {
    data = data || 0;
    var params = getParams(data, type, row, meta);
    var span = document.createElement('div');
    span.setAttribute('data-value', data);
    span.setAttribute('data-row', meta.row);
    if (params) {
      var link = document.createElement('a');
      link.textContent = helpers.currency(data);
      link.setAttribute('title', 'View individual transactions');
      var uri = helpers.buildAppUrl(path, _.extend(
        {committee_id: row.committee_id},
        buildAggregateUrl(_.extend({}, row, params).cycle),
        params
      ));
      link.setAttribute('href', uri);
      span.appendChild(link);
    } else {
      span.textContent = helpers.currency(data);
    }
    return span.outerHTML;
  };
}

function formattedColumn(formatter, defaultOpts) {
  defaultOpts = defaultOpts || {};
  return function(opts) {
    return _.extend({}, defaultOpts, {
      render: function(data, type, row, meta) {
        return formatter(data, type, row, meta);
      }
    }, opts);
  };
}

function barColumn(formatter) {
  formatter = formatter || function(value) { return value; };
  return function(opts) {
    return _.extend({
      orderSequence: ['desc', 'asc'],
      render: function(data, type, row, meta) {
        var span = document.createElement('div');
        span.textContent = formatter(_.max([data, 0]));
        span.setAttribute('data-value', data || 0);
        span.setAttribute('data-row', meta.row);
        return span.outerHTML;
      }
    }, opts);
  };
}

function urlColumn(attr, opts) {
  return _.extend({
    render: function(data, type, row, meta) {
      if (row[attr]) {
        var anchor = document.createElement('a');
        anchor.textContent = data;
        anchor.setAttribute('href', row[attr]);
        anchor.setAttribute('target', '_blank');
        return anchor.outerHTML;
      } else {
        return data;
      }
    }
  }, opts);
}

var dateColumn = formattedColumn(helpers.datetime, {orderSequence: ['desc', 'asc']});
var currencyColumn = formattedColumn(helpers.currency, {orderSequence: ['desc', 'asc']});
var barCurrencyColumn = barColumn(helpers.currency);

var candidateColumn = formattedColumn(function(data, type, row) {
  if (row) {
    return buildEntityLink(row.candidate_name, helpers.buildAppUrl(['candidate', row.candidate_id]), 'candidate');
  } else {
    return '';
  }
});

var committeeColumn = formattedColumn(function(data, type, row) {
  if (row) {
    return buildEntityLink(row.committee_name, helpers.buildAppUrl(['committee', row.committee_id]), 'committee');
  } else {
    return '';
  }
});

function mapSort(order, columns) {
  return _.map(order, function(item) {
    var name = columns[item.column].data;
    if (item.dir === 'desc') {
      name = '-' + name;
    }
    return name;
  });
}

function mapResponse(response) {
  return {
    recordsTotal: response.pagination.count,
    recordsFiltered: response.pagination.count,
    data: response.results
  };
}

function identity(value) {
  return value;
}

var MODAL_TRIGGER_CLASS = 'js-panel-trigger';
var MODAL_TRIGGER_HTML = '<button class="js-panel-button icon arrow--right">' +
  '<span class="u-visually-hidden">Toggle details</span>' +
'</button>';

function modalRenderRow(row, data, index) {
  row.classList.add(MODAL_TRIGGER_CLASS, 'row--has-panel');
}

function modalRenderFactory(template, fetch) {
  var callback;
  fetch = fetch || identity;
  return function(api, data, response) {
    var $table = $(api.table().node());
    var $modal = $('#datatable-modal');
    var $main = $table.closest('.panel__main');
    // Move the modal to the results div.
    $modal.appendTo($main);
    $modal.css('display', 'block');

    // Add a class to the .dataTables_wrapper
    $table.closest('.dataTables_wrapper').addClass('dataTables_wrapper--panel');

    $table.off('click keypress', '.js-panel-toggle tr.' + MODAL_TRIGGER_CLASS, callback);
    callback = function(e) {
      if (e.which === 13 || e.type === 'click') {
        // Note: Use `currentTarget` to get parent row, since the target column
        // may have been moved since the triggering event
        var $row = $(e.currentTarget);
        var $target = $(e.target);
        if ($target.is('a')) {
          return true;
        }
        if (!$target.closest('td').hasClass('dataTables_empty')) {
          var index = api.row($row).index();
          $.when(fetch(response.results[index])).done(function(fetched) {
            $modal.find('.js-panel-content').html(template(fetched));
            $modal.attr('aria-hidden', 'false');
            $row.siblings().toggleClass('row-active', false);
            $row.toggleClass('row-active', true);
            $('body').toggleClass('panel-active', true);
            accessibility.restoreTabindex($modal);
            var hideColumns = api.columns('.hide-panel');
            hideColumns.visible(false);

            // Populate the pdf button if there is one
            if (fetched.pdf_url) {
              $modal.find('.js-pdf_url').attr('href', fetched.pdf_url);
            } else {
              $modal.find('.js-pdf_url').remove();
            }

            // Set focus on the close button
            $('.js-hide').focus();

            // When under $large-screen
            // TODO figure way to share these values with CSS.
            if ($(document).width() < 980) {
              api.columns('.hide-panel-tablet').visible(false);
            }
          });
        }
      }
    };
    $table.on('click keypress', '.js-panel-toggle tr.' + MODAL_TRIGGER_CLASS, callback);

    $modal.on('click', '.js-panel-close', function(e) {
      e.preventDefault();
      hidePanel(api, $modal);
    });
  };
}

function hidePanel(api, $modal) {
    $('.row-active .js-panel-button').focus();
    $('.js-panel-toggle tr').toggleClass('row-active', false);
    $('body').toggleClass('panel-active', false);
    $modal.attr('aria-hidden', 'true');

    if ($(document).width() > 640) {
      api.columns('.hide-panel-tablet').visible(true);
    }

    if ($(document).width() > 980) {
      api.columns('.hide-panel').visible(true);
    }

    accessibility.removeTabindex($modal);
}

function barsAfterRender(template, api, data, response) {
  var $table = $(api.table().node());
  var $cols = $table.find('div[data-value]');
  var values = $cols.map(function(idx, each) {
    return parseFloat(each.getAttribute('data-value'));
  });
  var max = _.max(values);
  $cols.after(function() {
    var value = $(this).attr('data-value');
    var width = 100 * parseFloat(value) / max;
    return '<div class="bar-container">' +
      '<div class="value-bar" style="width: ' + width + '%"></div>' +
    '</div>';
  });
}

function updateOnChange($form, api) {
  function onChange(e) {
    e.preventDefault();
    hidePanel(api, $('#datatable-modal'));
    api.ajax.reload();
  }
  $form.on('change', 'input,select', _.debounce(onChange, 250));
}

function OffsetPaginator() {}

OffsetPaginator.prototype.mapQuery = function(data) {
  return {
    per_page: data.length,
    page: Math.floor(data.start / data.length) + 1,
  };
};

OffsetPaginator.prototype.handleResponse = function() {};

function SeekPaginator() {
  this.indexes = {};
  this.query = null;
}

SeekPaginator.prototype.getIndexes = function(length, start) {
  return (this.indexes[length] || {})[start] || {};
};

SeekPaginator.prototype.setIndexes = function(length, start, value) {
  this.indexes[length] = this.indexes[length] || {};
  this.indexes[length][start] = value;
};

SeekPaginator.prototype.clearIndexes = function() {
  this.indexes = {};
};

SeekPaginator.prototype.mapQuery = function(data, query) {
  if (!_.isEqual(query, this.query)) {
    this.query = _.clone(query);
    this.clearIndexes();
  }
  var indexes = this.getIndexes(data.length, data.start);
  return _.extend(
    {per_page: data.length},
    _.chain(Object.keys(indexes))
      .filter(function(key) { return indexes[key]; })
      .map(function(key) { return [key, indexes[key]]; })
      .object()
      .value()
  );
};

SeekPaginator.prototype.handleResponse = function(data, response) {
  this.setIndexes(data.length, data.length + data.start, response.pagination.last_indexes);
};

var defaultOpts = {
  serverSide: true,
  searching: false,
  lengthMenu: [30, 50, 100],
  responsive: {details: false},
  language: {
    lengthMenu: 'Results per page: _MENU_',
    info: 'Showing _START_ – _END_ of _TOTAL_ records'
  },
  pagingType: 'simple',
  title: null,
  dom: browseDOM,
};

var defaultCallbacks = {
  afterRender: function() {}
};

function DataTable(selector, opts) {
  opts = opts || {};
  this.$body = $(selector);
  this.opts = _.extend({}, defaultOpts, {ajax: this.fetch.bind(this)}, opts);
  this.callbacks = _.extend({}, defaultCallbacks, opts.callbacks);
  this.filterPanel = (this.opts.panel || {});
  this.filterSet = this.filterPanel.filterSet;

  this.xhr = null;
  this.fetchContext = null;
  this.hasWidgets = null;
  this.filters = null;

  var Paginator = this.opts.paginator || OffsetPaginator;
  this.paginator = new Paginator();
  this.api = this.$body.DataTable(this.opts);

  DataTable.registry[this.$body.attr('id')] = this;

  if (this.filterPanel) {
    updateOnChange(this.filterSet.$body, this.api);
    urls.updateQuery(this.filterSet.serialize(), this.filterSet.fields);
    this.$body.on('draw.dt', this, function(e) {
      e.data.filterPanel.setHeight();
    });
  }

  if (this.opts.useFilters) {
    $(window).on('popstate', this.handlePopState.bind(this));
  }

  if (this.opts.useExport) {
    $(document.body).on('download:countChanged', this.refreshExport.bind(this));
  }

  this.$body.css('width', '100%');
  this.$body.find('tbody').addClass('js-panel-toggle');
}

DataTable.prototype.refreshExport = function() {
  if (this.opts.useExport && !this.opts.disableExport) {
    if (this.api.context[0].fnRecordsTotal() > DOWNLOAD_CAP) {
      this.disableExport({message: DOWNLOAD_MESSAGES.recordCap});
    } else if (this.isPending()) {
      this.disableExport({message: DOWNLOAD_MESSAGES.pending});
    } else if (download.pendingCount() >= MAX_DOWNLOADS) {
      this.disableExport({message: DOWNLOAD_MESSAGES.downloadCap});
    } else {
      this.enableExport();
    }
  }
};

DataTable.prototype.destroy = function() {
  this.api.destroy();
  delete DataTable.registry[this.$body.attr('id')];
};

DataTable.prototype.handlePopState = function() {
  this.filterSet.activate();
  var filters = this.filterSet.serialize();
  if (!_.isEqual(filters, this.filters)) {
    this.api.ajax.reload();
  }
};

DataTable.prototype.ensureWidgets = function() {
  if (this.hasWidgets) { return; }
  this.$processing = $('<div class="overlay is-loading"></div>').hide();
  this.$body.before(this.$processing);
  this.$widgets = $('.js-data-widgets');

  var $paging = this.$body.closest('.dataTables_wrapper').find('.js-results-info');

  if (this.opts.useExport) {
    this.$title = $(titleTemplate({title: this.opts.title}));
    $paging.prepend(this.$title);

    this.$exportWidget = $(exportWidgetTemplate());
    this.$widgets.append(this.$exportWidget);
    this.$exportButton = $('.js-export');
    this.$exportTooltipContainer = $('.js-tooltip-container');
    this.$exportTooltip = this.$exportWidget.find('.tooltip');

    this.$exportInfo = $('.js-info');
    this.$exportInfo.append($('#results_info'));

    this.$exportButton.on('click', this.export.bind(this));

  }

  if (this.opts.disableExport) {
    this.disableExport({message: DOWNLOAD_MESSAGES.comingSoon});
  }

  this.hasWidgets = true;
};

DataTable.prototype.disableExport = function(opts) {
  this.$exportButton.addClass('disabled');
  this.$exportButton.off('click');

  // Adding everything we need for the tooltip
  this.$exportButton.attr('aria-describedby', 'export-tooltip');
  var $exportTooltip = this.$exportTooltip;
  $exportTooltip.html(opts.message);

  function hideTooltip() {
    $exportTooltip.attr('aria-hidden', 'true');
  }
  function showTooltip() {
    $exportTooltip.attr('aria-hidden', 'false');
  }

  this.$exportTooltipContainer.hover(showTooltip, hideTooltip);
  this.$exportButton.focus(showTooltip);
  this.$exportButton.blur(hideTooltip);
};

DataTable.prototype.enableExport = function() {
  this.$exportButton.removeClass('disabled');
  this.$exportButton.on('click', this.export.bind(this));
  this.$exportTooltip.attr('aria-hidden', 'true');

  // Remove all tooltip stuff
  this.$exportButton.removeAttr('aria-describedby');
  this.$exportTooltipContainer.off('mouseenter mouseleave');
  this.$exportButton.off('focus blur');
};

DataTable.prototype.fetch = function(data, callback) {
  var self = this;
  self.ensureWidgets();
  if (self.filterSet) {
    urls.pushQuery(self.filterSet.serialize(), self.filterSet.fields);
    self.filters = self.filterSet.serialize();
  }
  var url = self.buildUrl(data);
  self.$processing.show();
  if (self.xhr) {
    self.xhr.abort();
  }
  self.fetchContext = {
    data: data,
    callback: callback
  };
  self.xhr = $.getJSON(url);
  self.xhr.done(self.fetchSuccess.bind(self));
  self.xhr.fail(self.fetchError.bind(self));
  self.xhr.always(function() {
    self.$processing.hide();
  });
};

DataTable.prototype.export = function() {
  var url = this.buildUrl(this.api.ajax.params(), false);
  download.download(url);
  this.disableExport({message: DOWNLOAD_MESSAGES.pending});
};

DataTable.prototype.isPending = function() {
  var url = this.buildUrl(this.api.ajax.params(), false);
  return download.isPending(url);
};

DataTable.prototype.buildUrl = function(data, paginate) {
  var query = _.extend({}, this.filters || {});
  paginate = typeof paginate === 'undefined' ? true : paginate;
  query.sort = mapSort(data.order, this.opts.columns);

  if (paginate) {
    query = _.extend(query, this.paginator.mapQuery(data, query));
  }
  return helpers.buildUrl(this.opts.path, _.extend({}, query, this.opts.query || {}));
};

DataTable.prototype.fetchSuccess = function(resp) {
  this.paginator.handleResponse(this.fetchContext.data, resp);
  this.fetchContext.callback(mapResponse(resp));
  this.callbacks.afterRender(this.api, this.fetchContext.data, resp);

  this.refreshExport();

  if (this.opts.hideEmpty) {
    this.hideEmpty(resp);
  }
};

DataTable.prototype.fetchError = function() {

};

/**
 * Replace a `DataTable` with placeholder text if no results found. Should only
 * be used with unfiltered tables, else tables may be destroyed on restrictive
 * filtering.
 */
DataTable.prototype.hideEmpty = function(response) {
  if (!response.pagination.count) {
    this.destroy();
    this.$body.before('<div class="message message--alert">No data found.</div>');
    this.$body.remove();
  }
};

DataTable.registry = {};

DataTable.defer = function($table, opts) {
  tabs.onShow($table, function() {
    new DataTable($table, opts);
  });
};

module.exports = {
  simpleDOM: simpleDOM,
  browseDOM: browseDOM,
  yearRange: yearRange,
  getCycle: getCycle,
  buildTotalLink: buildTotalLink,
  buildEntityLink: buildEntityLink,
  candidateColumn: candidateColumn,
  committeeColumn: committeeColumn,
  currencyColumn: currencyColumn,
  urlColumn: urlColumn,
  barCurrencyColumn: barCurrencyColumn,
  dateColumn: dateColumn,
  barsAfterRender: barsAfterRender,
  modalRenderRow: modalRenderRow,
  modalRenderFactory: modalRenderFactory,
  MODAL_TRIGGER_CLASS: MODAL_TRIGGER_CLASS,
  MODAL_TRIGGER_HTML: MODAL_TRIGGER_HTML,
  mapSort: mapSort,
  mapResponse: mapResponse,
  DataTable: DataTable,
  OffsetPaginator: OffsetPaginator,
  SeekPaginator: SeekPaginator
};
