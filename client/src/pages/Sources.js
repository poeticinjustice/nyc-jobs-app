import React from 'react';
import { HiExternalLink } from 'react-icons/hi';

const SOURCE_GROUPS = [
  {
    name: 'Government',
    sources: [
      { label: 'NYC City Jobs', url: 'https://cityjobs.nyc.gov/', description: 'City of New York agencies' },
      { label: 'New York State', url: 'https://statejobs.ny.gov/public/vacancytable.cfm', description: 'State agencies in NYC metro' },
      { label: 'Federal (USAJobs)', url: 'https://www.usajobs.gov/', description: 'Federal government positions' },
    ],
  },
  {
    name: 'Transit',
    sources: [
      { label: 'Port Authority NY/NJ', url: 'https://jobs.jobvite.com/panynj/jobs', description: 'Airports, bridges, tunnels, PATH' },
      { label: 'MTA', url: 'https://careers.mta.org/us/en/search-results', description: 'Subways, buses, LIRR, Metro-North' },
      { label: 'Amtrak', url: 'https://careers.amtrak.com/search/?q=&optionsFacetsDD_state=New+York', description: 'Amtrak — New York positions' },
    ],
  },
  {
    name: 'Universities',
    sources: [
      { label: 'CUNY', url: 'https://cuny.jobs/', description: 'City University of New York system' },
      { label: 'NYU', url: 'https://uscareers-nyu.icims.com/jobs/search', description: 'New York University' },
      { label: 'Columbia University', url: 'https://opportunities.columbia.edu/', description: 'Columbia University' },
      { label: 'Fordham University', url: 'https://careers.fordham.edu/postings/search', description: 'Fordham University campuses' },
      { label: 'The New School', url: 'https://newschool.wd1.myworkdayjobs.com/External', description: 'The New School, Parsons' },
    ],
  },
  {
    name: 'Healthcare',
    sources: [
      { label: 'Mount Sinai', url: 'https://careers.mountsinai.org/', description: 'Mount Sinai Health System' },
      { label: 'NewYork-Presbyterian', url: 'https://nyp.wd1.myworkdayjobs.com/nypcareers', description: 'NYP hospital network' },
      { label: 'Northwell Health', url: 'https://eppr.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2', description: 'Northwell Health system' },
      { label: 'NYU Langone Health', url: 'https://jobs.silkroad.com/NYULangone/NYULHCareers', description: 'NYU Langone hospitals and facilities' },
      { label: 'Memorial Sloan Kettering', url: 'https://msk.wd108.myworkdayjobs.com/MSKCC_Careers_Primary', description: 'MSK Cancer Center' },
      { label: 'Montefiore Health System', url: 'https://montefiore.wd12.myworkdayjobs.com/MMC', description: 'Montefiore medical campuses' },
      { label: 'NYC Health + Hospitals', url: 'https://providercareers.nychealthandhospitals.org/search', description: 'Public hospital system — provider/clinical roles' },
    ],
  },
  {
    name: 'Museums',
    sources: [
      { label: 'American Museum of Natural History', url: 'https://careers.amnh.org/postings/search', description: 'AMNH — Central Park West' },
      { label: 'The Metropolitan Museum of Art', url: 'https://metmuseum.wd5.myworkdayjobs.com/metmuseumcareers', description: 'The Met Fifth Avenue and Cloisters' },
      { label: 'The Frick Collection', url: 'https://recruiting.paylocity.com/recruiting/jobs/All/aba29db6-33d4-433d-b062-02c67cda2776/The-Frick-Collection', description: 'The Frick Collection — Upper East Side' },
      { label: 'Solomon R. Guggenheim Museum', url: 'https://theapplicantmanager.com/careers?co=ny', description: 'Guggenheim — Fifth Avenue' },
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
      { label: 'New York Public Library', url: 'https://nypl.pinpointhq.com/', description: 'NYPL branches across NYC' },
      { label: 'Idealist', url: 'https://www.idealist.org/en/jobs?q=&areasOfFocus=&locationName=New+York&locationType=AREA', description: 'Non-profit jobs in NYC area' },
      { label: 'United Nations', url: 'https://careers.un.org/', description: 'UN headquarters — New York' },
    ],
  },
];

const Sources = () => (
  <div className='max-w-4xl mx-auto px-4 py-8'>
    <h1 className='text-2xl font-bold text-gray-900 mb-2'>Job Sources</h1>
    <p className='text-gray-600 mb-8'>
      We search these organizations directly so you can find jobs across NYC in one place.
      Click any link to browse their full career page.
      This site does not include every job from every employer — check their pages for the most complete listings.
    </p>

    {SOURCE_GROUPS.map((group) => (
      <div key={group.name} className='mb-8'>
        <h2 className='text-lg font-semibold text-gray-800 mb-3 border-b border-gray-200 pb-2'>
          {group.name}
        </h2>
        <div className='grid gap-3'>
          {group.sources.map((source) => (
            <a
              key={source.label}
              href={source.url}
              target='_blank'
              rel='noopener noreferrer'
              className='flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors group'
            >
              <div>
                <span className='font-medium text-gray-900 group-hover:text-primary-700'>
                  {source.label}
                </span>
                {source.description && (
                  <span className='text-sm text-gray-500 ml-2'>
                    — {source.description}
                  </span>
                )}
              </div>
              <HiExternalLink className='h-4 w-4 text-gray-400 group-hover:text-primary-600 shrink-0 ml-2' />
            </a>
          ))}
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
