import http

import datetime
import re

import furl
from webargs import fields
from webargs.flaskparser import use_kwargs
from flask import render_template, request, redirect, url_for, abort
from collections import OrderedDict

from openfecwebapp import views
from openfecwebapp import utils
from openfecwebapp import config
from openfecwebapp import constants
from openfecwebapp import api_caller
from openfecwebapp.app import app


@app.route('/')
def search():
    """Renders the top-level /data page.

    If there's a query string, it will
    load candidate and committee search results.

    If the string is a 16 or 11 digit number then it will redirect to
    the page-by-page viewer.

    If there's no query, then we'll load the main landing page with all the
    necessary data.
    """
    query = request.args.get('search')

    if query:
        if re.match('\d{16}', query) or re.match('\d{11}', query):
            url = 'http://docquery.fec.gov/cgi-bin/fecimg/?' + query
            return redirect(url)
        else:
            results = api_caller.load_search_results(query)
            return views.render_search_results(results, query)

    else:
        top_candidates_raising = api_caller.load_top_candidates('-receipts', per_page=3)
        return render_template('landing.html',
            page='home',
            parent='data',
            dates=utils.date_ranges(),
            top_candidates_raising=top_candidates_raising['results'] if top_candidates_raising else None,
            first_of_year=datetime.date(datetime.date.today().year, 1, 1).strftime('%m/%d/%Y'),
            last_of_year=datetime.date(datetime.date.today().year, 12, 31).strftime('%m/%d/%Y'),
            title='Campaign finance data')


@app.route('/api/')
def api():
    """Redirect to API as described at
    https://18f.github.io/API-All-the-X/pages/developer_hub_kit.
    """
    return redirect(config.api_location, http.client.MOVED_PERMANENTLY)


@app.route('/developers/')
def developers():
    """Redirect to developer portal as described at
    https://18f.github.io/API-All-the-X/pages/developer_hub_kit.
    """
    url = furl.furl(config.api_location)
    url.path.add('developers')
    return redirect(url.url, http.client.MOVED_PERMANENTLY)


@app.route('/candidate/<c_id>/')
@use_kwargs({
    'cycle': fields.Int(),
    'election_full': fields.Bool(missing=True),
})
def candidate_page(c_id, cycle=None, election_full=True):
    """Fetch and render data for candidate detail page.

    :param int cycle: Optional cycle for associated committees and financials.
    :param bool election_full: Load full election period

    """
    candidate, committees, cycle = api_caller.load_with_nested(
        'candidate', c_id, 'committees',
        cycle=cycle, cycle_key='two_year_period',
        election_full=election_full,
    )

    if election_full and cycle and cycle not in candidate['election_years']:
        next_cycle = next(
            (
                year for year in sorted(candidate['election_years'])
                if year > cycle
            ),
            max(candidate['election_years']),
        )

        # If the next_cycle is odd set it to whatever the cycle value was
        # and then set election_full to false
        # This solves an issue with special elections
        if next_cycle % 2 > 0:
            next_cycle = cycle
            election_full = False

        return redirect(
            url_for('candidate_page', c_id=c_id, cycle=next_cycle, election_full=election_full)
        )

    return views.render_candidate(candidate, committees, cycle, election_full)


@app.route('/committee/<c_id>/')
@app.route('/committee/<c_id>/')
@use_kwargs({
    'cycle': fields.Int(),
})
def committee_page(c_id, cycle=None):
    """Fetch and render data for committee detail page.

    :param int cycle: Optional cycle for financials.
    """

    # If the cycle param is explicitly defined, then load that cycle
    # Otherwise, redirect to the last cycle with reports, as determined in render_committee()
    redirect_to_previous = False if cycle else True
    committee, candidates, cycle = api_caller.load_with_nested('committee', c_id, 'candidates', cycle)
    return views.render_committee(committee, candidates, cycle, redirect_to_previous)


@app.route('/advanced/')
def advanced():
    return render_template(
        'advanced.html',
        parent='data',
        title='Advanced data'
    )


@app.route('/candidates/')
@use_kwargs({
  'page': fields.Int(missing=1)
})
def candidates(**kwargs):
    candidates = api_caller._call_api('candidates', **kwargs)
    return render_template(
        'datatable.html',
        parent='data',
        result_type='candidates',
        slug='candidates',
        title='Candidates',
        data=candidates['results'],
        query=kwargs,
        columns=constants.table_columns['candidates']
    )


@app.route('/candidates/<office>/')
def candidates_office(office):
    if office.lower() not in ['president', 'senate', 'house']:
        abort(404)
    return render_template(
        'datatable.html',
        parent='data',
        result_type='candidates',
        title='candidates for ' + office,
        slug='candidates-office',
        table_context=OrderedDict([('office', office)]),
        columns=constants.table_columns['candidates-office-' + office.lower()]
    )


@app.route('/committees/')
@use_kwargs({
  'page': fields.Int(missing=1)
})
def committees( **kwargs):
    committees = api_caller._call_api('committees', **kwargs)
    return render_template(
        'datatable.html',
        parent='data',
        result_type='committees',
        slug='committees',
        title='Committees',
        data=committees['results'],
        query=kwargs,
        columns=constants.table_columns['committees']
    )


@app.route('/receipts/')
def receipts():
    return render_template(
        'datatable.html',
        parent='data',
        slug='receipts',
        title='Receipts',
        dates=utils.date_ranges(),
        columns=constants.table_columns['receipts'],
        has_data_type_toggle=True
    )


@app.route('/receipts/individual-contributions/')
def individual_contributions():
    return render_template(
        'datatable.html',
        parent='data',
        result_type='receipts',
        title='Individual contributions',
        slug='individual-contributions',
        dates=utils.date_ranges(),
        columns=constants.table_columns['individual-contributions']
    )


@app.route('/disbursements/')
def disbursements():
    return render_template(
        'datatable.html',
        parent='data',
        slug='disbursements',
        title='Disbursements',
        dates=utils.date_ranges(),
        columns=constants.table_columns['disbursements'],
        has_data_type_toggle=True
    )


@app.route('/filings/')
def filings():
    return render_template(
        'datatable.html',
        parent='data',
        slug='filings',
        title='Filings',
        dates=utils.date_ranges(),
        result_type='committees',
        has_data_type_toggle=True,
        columns=constants.table_columns['filings']
    )


@app.route('/independent-expenditures/')
def independent_expenditures():
    return render_template(
        'datatable.html',
        parent='data',
        slug='independent-expenditures',
        title='Independent expenditures',
        dates=utils.date_ranges(),
        columns=constants.table_columns['independent-expenditures'],
        has_data_type_toggle=True
    )


@app.route('/electioneering-communications/')
def electioneering_communications():
    return render_template(
        'datatable.html',
        parent='data',
        slug='electioneering-communications',
        title='Electioneering communications',
        dates=utils.date_ranges(),
        columns=constants.table_columns['electioneering-communications']
    )


@app.route('/communication-costs/')
def communication_costs():
    return render_template(
        'datatable.html',
        parent='data',
        slug='communication-costs',
        title='Communication costs',
        dates=utils.date_ranges(),
        columns=constants.table_columns['communication-costs']
    )


@app.route('/loans/')
def loans():
    return render_template(
        'datatable.html',
        parent='data',
        result_type='loans',
        slug='loans',
        title='loans',
        columns=constants.table_columns['loans']
    )


@app.route('/party-coordinated-expenditures/')
def party_coordinated_expenditures():
    return render_template(
        'datatable.html',
        parent='data',
        slug='party-coordinated-expenditures',
        title='Party coordinated expenditures',
        dates=utils.date_ranges(),
        columns=constants.table_columns['party-coordinated-expenditures']
    )


@app.route('/reports/<form_type>/')
def reports(form_type):
    if form_type.lower() not in ['presidential', 'house-senate', 'pac-party', 'ie-only']:
        abort(404)
    if form_type.lower() == 'presidential':
        title = 'Presidential committee reports'
    if form_type.lower() == 'house-senate':
        title = 'House and Senate committee reports'
    if form_type.lower() == 'pac-party':
        title = 'PAC and party committee reports'
    if form_type.lower() == 'ie-only':
        title = 'Independent expenditure only committee reports'
    context = OrderedDict([('form_type', form_type.lower())])
    return render_template(
        'datatable.html',
        parent='data',
        slug='reports',
        title=title,
        table_context=context,
        dates=utils.date_ranges(),
        has_data_type_toggle=True,
        columns=constants.table_columns['reports-' + form_type.lower()]
    )


@app.route('/elections/')
def election_lookup():
    return render_template('election-lookup.html', parent='data')


@app.route('/elections/<office>/<int:cycle>/')
@app.route('/elections/<office>/<state>/<int:cycle>/')
@app.route('/elections/<office>/<state>/<district>/<int:cycle>/')
def elections(office, cycle, state=None, district=None):
    # Get all cycles up until the cycle from the URL if it's beyond the current cycle
    # this fixes the issue of an election page not showing user-provided cycle
    # in the cycle select
    max_cycle = cycle if cycle > utils.current_cycle() else utils.current_cycle()
    cycles = utils.get_cycles(max_cycle)

    if office.lower() == 'president':
        cycles = [each for each in cycles if each % 4 == 0]
    elif office.lower() == 'senate':
        cycles = utils.get_state_senate_cycles(state)

    if office.lower() not in ['president', 'senate', 'house']:
        abort(404)
    if state and state.upper() not in constants.states:
        abort(404)

    return render_template(
        'elections.html',
        office=office,
        office_code=office[0],
        parent='data',
        cycle=cycle,
        cycles=cycles,
        state=state,
        state_full=constants.states[state.upper()] if state else None,
        district=district,
        title=utils.election_title(cycle, office, state, district),
    )


@app.route('/election-page/')
@use_kwargs({
    'state': fields.Str(),
    'district': fields.Str(),
})
def election_page(state=None, district=None):
    """This route is used to redirect users to a specific senate or house district page
    """
    if state and district:
        # If district is S, redirect to a senate page
        if district == 'S':
            # Find the state's senate cycles given the classes and then choose the first one
            cycles = utils.get_state_senate_cycles(state)
            cycle = cycles[0]
            redirect_url = url_for('elections',
                office='senate',
                state=state,
                cycle=cycle)
        else:
            redirect_url = url_for('elections',
                office='house',
                district=district,
                state=state,
                cycle=constants.DEFAULT_TIME_PERIOD)
        return redirect(redirect_url)
    else:
        return redirect(url_for('election_lookup', state=state, district=district))


@app.route('/raising/')
@use_kwargs({
    'top_category': fields.Str(load_from='top_category', missing='P'),
    'cycle': fields.Int(load_from='cycle', missing=2016),
})
def raising_breakdown(top_category, cycle):
    if top_category in ['pac']:
        top_raisers = api_caller.load_top_pacs('-receipts', cycle=cycle, per_page=10)
    elif top_category in ['party']:
        top_raisers = api_caller.load_top_parties('-receipts', cycle=cycle, per_page=10)
    else:
        top_raisers = api_caller.load_top_candidates('-receipts', office=top_category, cycle=cycle, per_page=10)

    if cycle == datetime.datetime.today().year:
        coverage_end_date = datetime.datetime.today()
    else:
        coverage_end_date = datetime.date(cycle, 12, 31)

    page_info = top_raisers['pagination']
    return render_template(
        'raising-breakdown.html',
        parent='data',
        title='Raising breakdown',
        top_category=top_category,
        coverage_start_date=datetime.date(cycle - 1, 1, 1),
        coverage_end_date=coverage_end_date,
        cycle=cycle,
        top_raisers=top_raisers['results'],
        page_info=utils.page_info(top_raisers['pagination'])
    )


@app.route('/spending/')
@use_kwargs({
    'top_category': fields.Str(load_from='top_category', missing='P'),
    'cycle': fields.Int(load_from='cycle', missing=2016),
})
def spending_breakdown(top_category, cycle):
    if top_category in ['pac']:
        top_spenders = api_caller.load_top_pacs('-disbursements', cycle=cycle, per_page=10)
    elif top_category in ['party']:
        top_spenders = api_caller.load_top_parties('-disbursements', cycle=cycle, per_page=10)
    else:
        top_spenders = api_caller.load_top_candidates('-disbursements', office=top_category, cycle=cycle, per_page=10)

    if cycle == datetime.datetime.today().year:
        coverage_end_date = datetime.datetime.today()
    else:
        coverage_end_date = datetime.date(cycle, 12, 31)

    return render_template(
        'spending-breakdown.html',
        parent='data',
        title='Spending breakdown',
        top_category=top_category,
        coverage_start_date=datetime.date(cycle - 1, 1, 1),
        coverage_end_date=coverage_end_date,
        cycle=cycle,
        top_spenders=top_spenders['results'],
        page_info=utils.page_info(top_spenders['pagination'])
    )


@app.route('/legal/search/')
@use_kwargs({
    'query': fields.Str(load_from='search'),
    'result_type': fields.Str(load_from='search_type', missing='all')
})
def legal_search(query, result_type):
    if result_type != 'all':
        # search_type is used for google analytics
        return redirect(url_for(result_type, search=query, search_type=result_type))

    results = {}

    # Only hit the API if there's an actual query
    if query:
        results = api_caller.load_legal_search_results(query, result_type, limit=3)

    return views.render_legal_search_results(results, query, result_type)


def legal_doc_search(query, result_type, **kwargs):
    """Legal search for a specific document type."""
    results = {}

    # Only hit the API if there's an actual query or if the result_type is AOs
    if query or result_type in ['advisory_opinions', 'murs']:
        results = api_caller.load_legal_search_results(query, result_type, **kwargs)

    return views.render_legal_doc_search_results(results, query, result_type)


@app.route('/legal/advisory-opinions/')
def advisory_opinions_landing():
    return views.render_legal_ao_landing()


@app.route('/legal/statutes/')
def statutes_landing():
    return render_template('legal-statutes-landing.html',
        parent='legal',
        result_type='statutes',
        display_name='statutes')


@app.route('/legal/search/advisory-opinions/')
@use_kwargs({
    'query': fields.Str(load_from='search'),
    'offset': fields.Int(missing=0)
})
def advisory_opinions(query, offset):
    return legal_doc_search(query, 'advisory_opinions')


@app.route('/legal/search/statutes/')
@use_kwargs({
    'query': fields.Str(load_from='search'),
    'offset': fields.Int(missing=0),
})
def statutes(query, offset):
    return legal_doc_search(query, 'statutes', offset=offset)


@app.route('/legal/search/enforcement/')
@use_kwargs({
    'query': fields.Str(load_from='search'),
    'mur_no': fields.Str(load_from='mur_no'),
    'mur_respondents': fields.Str(load_from='mur_respondents'),
    'mur_election_cycles': fields.Int(load_from='mur_election_cycles'),
    'offset': fields.Int(missing=0),
})
def murs(query, offset, mur_no=None, mur_respondents=None, mur_election_cycles=None,
    **kwargs):
    return legal_doc_search(query, 'murs',
        mur_no=mur_no,
        mur_respondents=mur_respondents,
        mur_election_cycles=mur_election_cycles,
        offset=offset)


# TODO migrating from /legal/regulations -> /legal/search/regulations,
# eventually there will be a regulations landing page
@app.route('/legal/regulations/')
def regulations_landing(*args, **kwargs):
    return redirect(url_for('regulations', *args, **kwargs))


@app.route('/legal/search/regulations/')
@use_kwargs({
    'query': fields.Str(load_from='search'),
    'offset': fields.Int(missing=0),
})
def regulations(query, offset):
    return legal_doc_search(query, 'regulations', offset=offset)


@app.route('/legal/advisory-opinions/<ao_no>/')
def advisory_opinion_page(ao_no):
    advisory_opinion = api_caller.load_legal_advisory_opinion(ao_no)

    if not advisory_opinion:
        abort(404)

    return views.render_legal_advisory_opinion(advisory_opinion)


@app.route('/legal/matter-under-review/<mur_no>/')
def mur_page(mur_no):
    mur = api_caller.load_legal_mur(mur_no)

    if not mur:
        abort(404)

    return views.render_legal_mur(mur)
