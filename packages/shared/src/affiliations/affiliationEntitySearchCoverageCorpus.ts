import type { OnboardingAffiliationCategoryId } from './onboardingAffiliationCatalog';

export type AffiliationCoverageQuery = {
  categoryId: OnboardingAffiliationCategoryId;
  query: string;
  expectedNameIncludes?: string[];
  expectedDomainIncludes?: string[];
  notes?: string;
};

/**
 * Synthetic CRJ-I9 evaluation corpus. Not user data.
 * expected* hints are used only to score live provider responses.
 */
export const AFFILIATION_ENTITY_SEARCH_COVERAGE_CORPUS: AffiliationCoverageQuery[] =
  [
    // Education
    {
      categoryId: 'education',
      query: 'University of Miami',
      expectedNameIncludes: ['miami'],
      expectedDomainIncludes: ['miami.edu'],
    },
    {
      categoryId: 'education',
      query: 'Florida International University',
      expectedNameIncludes: ['florida international', 'fiu'],
      expectedDomainIncludes: ['fiu.edu'],
    },
    {
      categoryId: 'education',
      query: 'Harvard',
      expectedNameIncludes: ['harvard'],
      expectedDomainIncludes: ['harvard.edu'],
    },
    {
      categoryId: 'education',
      query: 'Universidad Nacional de Colombia',
      expectedNameIncludes: ['nacional', 'colombia', 'unal'],
      expectedDomainIncludes: ['unal.edu'],
    },
    {
      categoryId: 'education',
      query: 'Miami Dade College',
      expectedNameIncludes: ['miami dade', 'mdc'],
      expectedDomainIncludes: ['mdc.edu'],
    },
    {
      categoryId: 'education',
      query: 'Stanford',
      expectedNameIncludes: ['stanford'],
      expectedDomainIncludes: ['stanford.edu'],
    },
    {
      categoryId: 'education',
      query: 'Universidad de los Andes',
      expectedNameIncludes: ['andes'],
      expectedDomainIncludes: ['uniandes.edu'],
    },
    {
      categoryId: 'education',
      query: 'Coral Gables Senior High',
      expectedNameIncludes: ['coral gables'],
    },
    {
      categoryId: 'education',
      query: 'FIU',
      expectedNameIncludes: ['florida international', 'fiu'],
      expectedDomainIncludes: ['fiu.edu'],
      notes: 'ambiguous acronym',
    },
    {
      categoryId: 'education',
      query: 'UM',
      expectedNameIncludes: ['miami', 'michigan'],
      notes: 'highly ambiguous acronym',
    },

    // Professional
    {
      categoryId: 'professional',
      query: 'Microsoft',
      expectedNameIncludes: ['microsoft'],
      expectedDomainIncludes: ['microsoft.com'],
    },
    {
      categoryId: 'professional',
      query: 'Google',
      expectedNameIncludes: ['google'],
      expectedDomainIncludes: ['google.com'],
    },
    {
      categoryId: 'professional',
      query: 'Bancolombia',
      expectedNameIncludes: ['bancolombia'],
      expectedDomainIncludes: ['bancolombia.com'],
    },
    {
      categoryId: 'professional',
      query: 'Rappi',
      expectedNameIncludes: ['rappi'],
      expectedDomainIncludes: ['rappi.com'],
    },
    {
      categoryId: 'professional',
      query: 'Amazon',
      expectedNameIncludes: ['amazon'],
      expectedDomainIncludes: ['amazon.com'],
    },
    {
      categoryId: 'professional',
      query: 'Mercy Hospital',
      expectedNameIncludes: ['mercy'],
    },
    {
      categoryId: 'professional',
      query: 'Greater Miami Chamber of Commerce',
      expectedNameIncludes: ['chamber', 'miami'],
    },
    {
      categoryId: 'professional',
      query: 'Deloitte',
      expectedNameIncludes: ['deloitte'],
      expectedDomainIncludes: ['deloitte.com'],
    },
    {
      categoryId: 'professional',
      query: 'EAFIT',
      expectedNameIncludes: ['eafit'],
      expectedDomainIncludes: ['eafit.edu'],
      notes: 'university often indexed as brand',
    },
    {
      categoryId: 'professional',
      query: 'WeWork',
      expectedNameIncludes: ['wework'],
      expectedDomainIncludes: ['wework.com'],
    },

    // Community
    {
      categoryId: 'community',
      query: 'American Red Cross',
      expectedNameIncludes: ['red cross'],
      expectedDomainIncludes: ['redcross.org'],
    },
    {
      categoryId: 'community',
      query: 'Rotary',
      expectedNameIncludes: ['rotary'],
      expectedDomainIncludes: ['rotary.org'],
    },
    {
      categoryId: 'community',
      query: 'United Way',
      expectedNameIncludes: ['united way'],
      expectedDomainIncludes: ['unitedway.org'],
    },
    {
      categoryId: 'community',
      query: 'Habitat for Humanity',
      expectedNameIncludes: ['habitat'],
      expectedDomainIncludes: ['habitat.org'],
    },
    {
      categoryId: 'community',
      query: 'Camillus House',
      expectedNameIncludes: ['camillus'],
    },
    {
      categoryId: 'community',
      query: 'Kiwanis',
      expectedNameIncludes: ['kiwanis'],
      expectedDomainIncludes: ['kiwanis.org'],
    },
    {
      categoryId: 'community',
      query: 'UNICEF',
      expectedNameIncludes: ['unicef'],
      expectedDomainIncludes: ['unicef.org'],
    },
    {
      categoryId: 'community',
      query: 'Miami Foundation',
      expectedNameIncludes: ['miami', 'foundation'],
    },
    {
      categoryId: 'community',
      query: 'Boys and Girls Clubs',
      expectedNameIncludes: ['boys', 'girls'],
      expectedDomainIncludes: ['bgca.org'],
    },
    {
      categoryId: 'community',
      query: 'Little Havana Neighborhood',
      expectedNameIncludes: ['little havana'],
      notes: 'local / likely weak brand index',
    },

    // Sports & Clubs
    {
      categoryId: 'sports_clubs',
      query: 'Inter Miami CF',
      expectedNameIncludes: ['inter miami', 'miami'],
      expectedDomainIncludes: ['intermiamicf.com'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'Miami Dolphins',
      expectedNameIncludes: ['dolphins'],
      expectedDomainIncludes: ['miamidolphins.com'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'Real Madrid',
      expectedNameIncludes: ['real madrid'],
      expectedDomainIncludes: ['realmadrid.com'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'Miami Heat',
      expectedNameIncludes: ['heat'],
      expectedDomainIncludes: ['nba.com', 'miamiheat'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'Atletico Nacional',
      expectedNameIncludes: ['nacional'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'FC Barcelona',
      expectedNameIncludes: ['barcelona'],
      expectedDomainIncludes: ['fcbarcelona.com'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'LA Fitness',
      expectedNameIncludes: ['la fitness'],
      expectedDomainIncludes: ['lafitness.com'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'YMCA',
      expectedNameIncludes: ['ymca'],
      expectedDomainIncludes: ['ymca.org'],
    },
    {
      categoryId: 'sports_clubs',
      query: 'Coral Gables Soccer Club',
      expectedNameIncludes: ['coral gables', 'soccer'],
      notes: 'local club',
    },
    {
      categoryId: 'sports_clubs',
      query: 'Book club',
      notes: 'not an organization-like brand',
    },

    // Faith
    {
      categoryId: 'faith',
      query: 'Catholic Church',
      expectedNameIncludes: ['catholic'],
      expectedDomainIncludes: ['vatican.va', 'usccb.org'],
    },
    {
      categoryId: 'faith',
      query: 'The Vatican',
      expectedNameIncludes: ['vatican'],
      expectedDomainIncludes: ['vatican.va'],
    },
    {
      categoryId: 'faith',
      query: 'Islamic Society of North America',
      expectedNameIncludes: ['islamic', 'isna'],
      expectedDomainIncludes: ['isna.net'],
    },
    {
      categoryId: 'faith',
      query: 'ADL',
      expectedNameIncludes: ['adl', 'defamation'],
      expectedDomainIncludes: ['adl.org'],
    },
    {
      categoryId: 'faith',
      query: 'Saddleback Church',
      expectedNameIncludes: ['saddleback'],
      expectedDomainIncludes: ['saddleback.com'],
    },
    {
      categoryId: 'faith',
      query: 'Temple Israel Miami',
      expectedNameIncludes: ['temple israel', 'miami'],
    },
    {
      categoryId: 'faith',
      query: 'Archdiocese of Miami',
      expectedNameIncludes: ['miami', 'archdiocese'],
    },
    {
      categoryId: 'faith',
      query: 'Buddhist',
      notes: 'identity/path, not an organization',
    },
    {
      categoryId: 'faith',
      query: 'Agnostic',
      notes: 'not an organization',
    },
    {
      categoryId: 'faith',
      query: 'Local storefront church',
      notes: 'intentionally weak / local',
    },

    // Political & Civic
    {
      categoryId: 'political_civic',
      query: 'ACLU',
      expectedNameIncludes: ['aclu', 'civil liberties'],
      expectedDomainIncludes: ['aclu.org'],
    },
    {
      categoryId: 'political_civic',
      query: 'League of Women Voters',
      expectedNameIncludes: ['league of women voters'],
      expectedDomainIncludes: ['lwv.org'],
    },
    {
      categoryId: 'political_civic',
      query: 'Democratic National Committee',
      expectedNameIncludes: ['democratic'],
      expectedDomainIncludes: ['democrats.org'],
    },
    {
      categoryId: 'political_civic',
      query: 'Republican National Committee',
      expectedNameIncludes: ['republican'],
      expectedDomainIncludes: ['gop.com', 'gop.org'],
    },
    {
      categoryId: 'political_civic',
      query: 'City of Miami',
      expectedNameIncludes: ['miami'],
      expectedDomainIncludes: ['miami.gov', 'miamigov.com'],
    },
    {
      categoryId: 'political_civic',
      query: 'Miami-Dade County',
      expectedNameIncludes: ['miami-dade', 'miami dade'],
      expectedDomainIncludes: ['miamidade.gov'],
    },
    {
      categoryId: 'political_civic',
      query: 'UN',
      expectedNameIncludes: ['united nations', 'un '],
      expectedDomainIncludes: ['un.org'],
      notes: 'ambiguous acronym',
    },
    {
      categoryId: 'political_civic',
      query: 'Independent',
      notes: 'political identity, not an org',
    },
    {
      categoryId: 'political_civic',
      query: 'No party affiliation',
      notes: 'not an organization',
    },
    {
      categoryId: 'political_civic',
      query: 'Libertarian Party',
      expectedNameIncludes: ['libertarian'],
      expectedDomainIncludes: ['lp.org'],
    },

    // Identity & Lifestyle
    {
      categoryId: 'identity_lifestyle',
      query: 'Veterans of Foreign Wars',
      expectedNameIncludes: ['vfw', 'veterans'],
      expectedDomainIncludes: ['vfw.org'],
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'American Legion',
      expectedNameIncludes: ['american legion'],
      expectedDomainIncludes: ['legion.org'],
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'PFLAG',
      expectedNameIncludes: ['pflag'],
      expectedDomainIncludes: ['pflag.org'],
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'NAACP',
      expectedNameIncludes: ['naacp'],
      expectedDomainIncludes: ['naacp.org'],
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'Toastmasters',
      expectedNameIncludes: ['toastmasters'],
      expectedDomainIncludes: ['toastmasters.org'],
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'Zodiac',
      notes: 'not an organization',
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'INTJ',
      notes: 'personality type, not an org',
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'Pet parent',
      notes: 'lifestyle label',
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'Duolingo',
      expectedNameIncludes: ['duolingo'],
      expectedDomainIncludes: ['duolingo.com'],
      notes: 'language-learning brand, not identity org',
    },
    {
      categoryId: 'identity_lifestyle',
      query: 'Miami native',
      notes: 'identity label',
    },
  ];
