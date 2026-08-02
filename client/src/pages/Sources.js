import React from 'react';
import { HiExternalLink } from 'react-icons/hi';
import { JOB_SOURCES, SOURCE_OPTIONS } from 'nyc-jobs-shared/constants';

// Hand-authored grouping, career-page URL, and blurb for each source — none of
// which lives in shared. `name` is an optional full title for this page: the
// shared labels are sized for filter chips ("AMNH", "City"), which reads badly
// as a heading in a directory whose job is to explain what each source is.
// Where `name` is omitted the shared label is used, so a new source still
// renders sensibly. Sources.test.js asserts every JOB_SOURCES value appears
// here exactly once, which is what actually prevents drift.
export const SOURCE_GROUPS = [
  {
    name: 'Government',
    sources: [
      { key: 'nyc', name: 'NYC City Jobs', url: 'https://cityjobs.nyc.gov/', description: 'City of New York agencies' },
      { key: 'nys', name: 'New York State', url: 'https://statejobs.ny.gov/public/vacancytable.cfm', description: 'State agencies in NYC metro' },
      { key: 'federal', name: 'Federal (USAJobs)', url: 'https://www.usajobs.gov/', description: 'Federal government positions' },
    ],
  },
  {
    name: 'Transit',
    sources: [
      { key: 'pa', url: 'https://jobs.jobvite.com/panynj/jobs', description: 'Airports, bridges, tunnels, PATH' },
      { key: 'mta', url: 'https://careers.mta.org/us/en/search-results', description: 'Subways, buses, LIRR, Metro-North' },
      { key: 'amtrak', url: 'https://careers.amtrak.com/search/?q=&optionsFacetsDD_state=New+York', description: 'Amtrak — New York positions' },
    ],
  },
  {
    name: 'Universities',
    sources: [
      { key: 'cuny', url: 'https://cuny.jobs/', description: 'City University of New York system' },
      { key: 'nyu', url: 'https://uscareers-nyu.icims.com/jobs/search', description: 'New York University' },
      { key: 'columbia', url: 'https://opportunities.columbia.edu/', description: 'Columbia University' },
      { key: 'fordham', url: 'https://careers.fordham.edu/postings/search', description: 'Fordham University campuses' },
      { key: 'newschool', url: 'https://newschool.wd1.myworkdayjobs.com/External', description: 'The New School, Parsons' },
    ],
  },
  {
    name: 'Healthcare',
    sources: [
      { key: 'mountsinai', url: 'https://careers.mountsinai.org/', description: 'Mount Sinai Health System' },
      { key: 'nyp', name: 'NewYork-Presbyterian', url: 'https://nyp.wd1.myworkdayjobs.com/nypcareers', description: 'NewYork-Presbyterian hospital network' },
      { key: 'northwell', url: 'https://eppr.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2', description: 'Northwell Health system' },
      { key: 'nyulangone', url: 'https://jobs.silkroad.com/NYULangone/NYULHCareers', description: 'NYU Langone hospitals and facilities' },
      { key: 'msk', name: 'Memorial Sloan Kettering', url: 'https://msk.wd108.myworkdayjobs.com/MSKCC_Careers_Primary', description: 'Memorial Sloan Kettering Cancer Center' },
      { key: 'montefiore', url: 'https://montefiore.wd12.myworkdayjobs.com/MMC', description: 'Montefiore medical campuses' },
      { key: 'nychhc', name: 'NYC Health + Hospitals', url: 'https://providercareers.nychealthandhospitals.org/search', description: 'Public hospital system — provider/clinical roles' },
    ],
  },
  {
    name: 'Museums',
    sources: [
      { key: 'amnh', name: 'American Museum of Natural History', url: 'https://careers.amnh.org/postings/search', description: 'American Museum of Natural History — Central Park West' },
      { key: 'metmuseum', url: 'https://metmuseum.wd5.myworkdayjobs.com/metmuseumcareers', description: 'The Met Fifth Avenue and Cloisters' },
      { key: 'frick', url: 'https://recruiting.paylocity.com/recruiting/jobs/All/aba29db6-33d4-433d-b062-02c67cda2776/The-Frick-Collection', description: 'The Frick Collection — Upper East Side' },
      { key: 'guggenheim', url: 'https://theapplicantmanager.com/careers?co=ny', description: 'Solomon R. Guggenheim Museum — Fifth Avenue' },
    ],
    comingSoon: [
      { label: 'MoMA', url: 'https://www.moma.org/about/careers' },
      { label: 'Brooklyn Museum', url: 'https://www.brooklynmuseum.org/about/careers' },
      { label: 'Whitney Museum', url: 'https://whitney.org/about/job-postings' },
    ],
  },
  {
    name: 'Non-Profit & Other',
    sources: [
      { key: 'nypl', name: 'New York Public Library', url: 'https://nypl.pinpointhq.com/', description: 'New York Public Library branches across NYC' },
      { key: 'idealist', name: 'Idealist (Non-Profit)', url: 'https://www.idealist.org/en/jobs?q=&areasOfFocus=&locationName=New+York&locationType=AREA', description: 'Non-profit jobs in NYC area' },
      { key: 'un', url: 'https://careers.un.org/', description: 'United Nations headquarters — New York' },
    ],
  },
];

export const sourceLabel = (source) =>
  source.name || SOURCE_OPTIONS.find((o) => o.value === source.key)?.label || source.key;

// Safety net: a source added to shared but not grouped above still shows up,
// so it is obvious it needs a real group, URL, and description.
const groupedKeys = SOURCE_GROUPS.flatMap((group) => group.sources.map((s) => s.key));
const ungroupedKeys = JOB_SOURCES.filter((key) => !groupedKeys.includes(key));

const RENDERED_GROUPS = ungroupedKeys.length
  ? [...SOURCE_GROUPS, { name: 'Other', sources: ungroupedKeys.map((key) => ({ key })) }]
  : SOURCE_GROUPS;

const Sources = () => (
  <div className='max-w-4xl mx-auto px-4 py-8'>
    <h1 className='text-2xl font-bold text-gray-900 mb-2'>Job Sources</h1>
    <p className='text-gray-600 mb-8'>
      We search these organizations directly so you can find jobs across NYC in one place.
      Click any link to browse their full career page.
      This site does not include every job from every employer — check their pages for the most complete listings.
    </p>

    {RENDERED_GROUPS.map((group) => (
      <div key={group.name} className='mb-8'>
        <h2 className='text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2'>
          {group.name}
        </h2>
        <div className='grid gap-3'>
          {group.sources.map((source) => {
            const label = sourceLabel(source);
            const body = (
              <div>
                <span className='font-medium text-gray-900 group-hover:text-primary-700'>
                  {label}
                </span>
                {source.description && (
                  <span className='text-sm text-gray-500 ml-2'>
                    — {source.description}
                  </span>
                )}
              </div>
            );
            // Ungrouped sources have no career-page URL yet — list them plainly
            if (!source.url) {
              return (
                <div
                  key={source.key}
                  className='flex items-center justify-between p-3 rounded-lg border border-gray-200'
                >
                  {body}
                </div>
              );
            }
            return (
              <a
                key={source.key}
                href={source.url}
                target='_blank'
                rel='noopener noreferrer'
                className='flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors group'
              >
                {body}
                <HiExternalLink className='h-4 w-4 text-gray-400 group-hover:text-primary-600 shrink-0 ml-2' />
              </a>
            );
          })}
          {group.comingSoon && (
            <div className='mt-2'>
              <p className='text-xs text-gray-400 mb-1'>Not yet included — visit directly:</p>
              <div className='flex flex-wrap gap-2'>
                {group.comingSoon.map((source) => (
                  <a
                    key={source.label}
                    href={source.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-xs text-gray-500 hover:text-primary-600 underline'
                  >
                    {source.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
);

export default Sources;
