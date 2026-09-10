export interface SelectOption {
  value: string;
  label: string;
  category?: string;
  searchTags?: string[];
}

/**
 * Comprehensive list of Indian Education Boards categorized into
 * National, State Boards (covering all states and UTs), and International.
 */
export const INDIAN_BOARDS: SelectOption[] = [
  // --- National Boards ---
  {
    value: 'CBSE',
    label: 'CBSE — Central Board of Secondary Education',
    category: 'National Boards',
    searchTags: ['cbse', 'central', 'delhi', 'national', 'all india'],
  },
  {
    value: 'CISCE / ICSE / ISC',
    label: 'CISCE — Council for the Indian School Certificate Examinations (ICSE / ISC)',
    category: 'National Boards',
    searchTags: ['cisce', 'icse', 'isc', 'council', 'national', 'delhi'],
  },
  {
    value: 'NIOS',
    label: 'NIOS — National Institute of Open Schooling',
    category: 'National Boards',
    searchTags: ['nios', 'open', 'distance', 'national'],
  },

  // --- State Boards ---
  {
    value: 'BSEAP (Andhra Pradesh)',
    label: 'Andhra Pradesh — BSEAP / BIEAP (Board of Secondary Education)',
    category: 'State Boards',
    searchTags: ['andhra pradesh', 'bseap', 'bieap', 'amaravati', 'hyderabad', 'ap'],
  },
  {
    value: 'SEBA / AHSEC (Assam)',
    label: 'Assam — SEBA / AHSEC (Secondary Education Board of Assam)',
    category: 'State Boards',
    searchTags: ['assam', 'seba', 'ahsec', 'guwahati', 'dispur'],
  },
  {
    value: 'BSEB (Bihar)',
    label: 'Bihar — BSEB (Bihar School Examination Board)',
    category: 'State Boards',
    searchTags: ['bihar', 'bseb', 'patna'],
  },
  {
    value: 'CGBSE (Chhattisgarh)',
    label: 'Chhattisgarh — CGBSE (Chhattisgarh Board of Secondary Education)',
    category: 'State Boards',
    searchTags: ['chhattisgarh', 'cgbse', 'raipur'],
  },
  {
    value: 'GBSHSE (Goa)',
    label: 'Goa — GBSHSE (Goa Board of Secondary & Higher Secondary Education)',
    category: 'State Boards',
    searchTags: ['goa', 'gbshse', 'panaji'],
  },
  {
    value: 'GSEB (Gujarat)',
    label: 'Gujarat — GSEB (Gujarat Secondary & Higher Secondary Education Board)',
    category: 'State Boards',
    searchTags: ['gujarat', 'gseb', 'gandhinagar', 'ahmedabad'],
  },
  {
    value: 'HBSE (Haryana)',
    label: 'Haryana — HBSE / BSEH (Board of School Education Haryana)',
    category: 'State Boards',
    searchTags: ['haryana', 'hbse', 'bseh', 'bhiwani', 'chandigarh'],
  },
  {
    value: 'HPBOSE (Himachal Pradesh)',
    label: 'Himachal Pradesh — HPBOSE (Himachal Pradesh Board of School Education)',
    category: 'State Boards',
    searchTags: ['himachal pradesh', 'hpbose', 'dharamshala', 'shimla', 'hp'],
  },
  {
    value: 'JKBOSE (Jammu & Kashmir)',
    label: 'Jammu & Kashmir — JKBOSE (J&K State Board of School Education)',
    category: 'State Boards',
    searchTags: ['jammu', 'kashmir', 'jkbose', 'srinagar', 'jk'],
  },
  {
    value: 'JAC (Jharkhand)',
    label: 'Jharkhand — JAC (Jharkhand Academic Council)',
    category: 'State Boards',
    searchTags: ['jharkhand', 'jac', 'ranchi'],
  },
  {
    value: 'KSEAB (Karnataka)',
    label: 'Karnataka — KSEAB (Karnataka School Examination & Assessment Board)',
    category: 'State Boards',
    searchTags: ['karnataka', 'kseab', 'kseeb', 'bangalore', 'bengaluru'],
  },
  {
    value: 'KBPE (Kerala)',
    label: 'Kerala — KBPE / DHSE Kerala (Kerala State Board)',
    category: 'State Boards',
    searchTags: ['kerala', 'kbpe', 'dhse', 'thiruvananthapuram', 'sslc'],
  },
  {
    value: 'MPBSE (Madhya Pradesh)',
    label: 'Madhya Pradesh — MPBSE (Madhya Pradesh Board of Secondary Education)',
    category: 'State Boards',
    searchTags: ['madhya pradesh', 'mpbse', 'bhopal', 'mp'],
  },
  {
    value: 'MSBSHSE (Maharashtra)',
    label: 'Maharashtra — MSBSHSE (Maharashtra State Board - SSC & HSC)',
    category: 'State Boards',
    searchTags: ['maharashtra', 'msbshse', 'pune', 'mumbai', 'ssc', 'hsc'],
  },
  {
    value: 'BSEM (Manipur)',
    label: 'Manipur — BSEM / COHSEM (Board of Secondary Education Manipur)',
    category: 'State Boards',
    searchTags: ['manipur', 'bsem', 'cohsem', 'imphal'],
  },
  {
    value: 'MBOSE (Meghalaya)',
    label: 'Meghalaya — MBOSE (Meghalaya Board of School Education)',
    category: 'State Boards',
    searchTags: ['meghalaya', 'mbose', 'shillong', 'tura'],
  },
  {
    value: 'MBSE (Mizoram)',
    label: 'Mizoram — MBSE (Mizoram Board of School Education)',
    category: 'State Boards',
    searchTags: ['mizoram', 'mbse', 'aizawl'],
  },
  {
    value: 'NBSE (Nagaland)',
    label: 'Nagaland — NBSE (Nagaland Board of School Education)',
    category: 'State Boards',
    searchTags: ['nagaland', 'nbse', 'kohima'],
  },
  {
    value: 'BSE Odisha',
    label: 'Odisha — BSE Odisha / CHSE Odisha (Board of Secondary Education)',
    category: 'State Boards',
    searchTags: ['odisha', 'orissa', 'bse odisha', 'chse', 'bhubaneswar', 'cuttack'],
  },
  {
    value: 'PSEB (Punjab)',
    label: 'Punjab — PSEB (Punjab School Education Board)',
    category: 'State Boards',
    searchTags: ['punjab', 'pseb', 'mohali', 'chandigarh'],
  },
  {
    value: 'RBSE (Rajasthan)',
    label: 'Rajasthan — RBSE / BSER (Board of Secondary Education Rajasthan)',
    category: 'State Boards',
    searchTags: ['rajasthan', 'rbse', 'bser', 'ajmer', 'jaipur'],
  },
  {
    value: 'TNBSE (Tamil Nadu)',
    label: 'Tamil Nadu — TNBSE / DGE (Tamil Nadu State Board)',
    category: 'State Boards',
    searchTags: ['tamil nadu', 'tnbse', 'tndge', 'chennai', 'tn'],
  },
  {
    value: 'TSBIE / BSE Telangana',
    label: 'Telangana — TSBIE / BSE Telangana (State Board)',
    category: 'State Boards',
    searchTags: ['telangana', 'tsbie', 'bse telangana', 'hyderabad', 'ts'],
  },
  {
    value: 'TBSE (Tripura)',
    label: 'Tripura — TBSE (Tripura Board of Secondary Education)',
    category: 'State Boards',
    searchTags: ['tripura', 'tbse', 'agartala'],
  },
  {
    value: 'UPMSP (Uttar Pradesh)',
    label: 'Uttar Pradesh — UPMSP (UP Board - Madhyamik Shiksha Parishad)',
    category: 'State Boards',
    searchTags: ['uttar pradesh', 'upmsp', 'up board', 'prayagraj', 'allahabad', 'lucknow', 'up'],
  },
  {
    value: 'UBSE (Uttarakhand)',
    label: 'Uttarakhand — UBSE (Uttarakhand Board of School Education)',
    category: 'State Boards',
    searchTags: ['uttarakhand', 'ubse', 'ramnagar', 'dehradun', 'uk'],
  },
  {
    value: 'WBBSE (West Bengal)',
    label: 'West Bengal — WBBSE / WBCHSE (West Bengal Board of Secondary Education)',
    category: 'State Boards',
    searchTags: ['west bengal', 'wbbse', 'wbchse', 'kolkata', 'wb', 'madhyamik'],
  },

  // --- International Boards in India ---
  {
    value: 'Cambridge International (CAIE / IGCSE)',
    label: 'Cambridge Assessment International Education (CAIE / IGCSE)',
    category: 'International Boards',
    searchTags: ['cambridge', 'caie', 'igcse', 'a levels', 'olevel', 'cie', 'international'],
  },
  {
    value: 'International Baccalaureate (IB)',
    label: 'International Baccalaureate (IB — PYP / MYP / DP)',
    category: 'International Boards',
    searchTags: ['international baccalaureate', 'ib', 'pyp', 'myp', 'dp', 'geneva', 'international'],
  },
  {
    value: 'Pearson Edexcel',
    label: 'Pearson Edexcel India',
    category: 'International Boards',
    searchTags: ['pearson', 'edexcel', 'international', 'uk'],
  },

  // --- Other / Autonomous ---
  {
    value: 'Autonomous / Other',
    label: 'Autonomous / Other Indian Board',
    category: 'Other',
    searchTags: ['autonomous', 'other', 'custom', 'private'],
  },
];

/**
 * Curricula commonly adopted by Indian schools.
 */
export const INDIAN_CURRICULA: SelectOption[] = [
  {
    value: 'NCERT',
    label: 'NCERT (National Council of Educational Research and Training)',
    category: 'National Standard',
    searchTags: ['ncert', 'national', 'standard', 'cbse'],
  },
  {
    value: 'CBSE Syllabus',
    label: 'CBSE Curriculum (Aligned with NCERT & NEP 2020)',
    category: 'National Standard',
    searchTags: ['cbse', 'syllabus', 'curriculum', 'nep'],
  },
  {
    value: 'ICSE / ISC Syllabus',
    label: 'CISCE / ICSE / ISC Prescribed Curriculum',
    category: 'National Standard',
    searchTags: ['icse', 'isc', 'cisce', 'council'],
  },
  {
    value: 'State Board Syllabus (SCERT)',
    label: 'State SCERT Syllabus (State-Specific Curriculum)',
    category: 'State Standard',
    searchTags: ['scert', 'state board', 'state syllabus', 'regional'],
  },
  {
    value: 'Cambridge Curriculum (CIPP / IGCSE / A-Levels)',
    label: 'Cambridge International Curriculum',
    category: 'International',
    searchTags: ['cambridge', 'cipp', 'igcse', 'a-levels', 'checkpoints'],
  },
  {
    value: 'IB Curriculum (PYP / MYP / DP)',
    label: 'IB Continuum Curriculum (PYP / MYP / DP)',
    category: 'International',
    searchTags: ['ib', 'pyp', 'myp', 'dp', 'international baccalaureate'],
  },
  {
    value: 'NIOS Curriculum',
    label: 'NIOS Open School Curriculum',
    category: 'Open Schooling',
    searchTags: ['nios', 'open', 'distance'],
  },
  {
    value: 'NEP 2020 Competency-Based',
    label: 'NEP 2020 Competency-Based Curriculum',
    category: 'National Standard',
    searchTags: ['nep', 'nep 2020', 'competency', 'foundational'],
  },
  {
    value: 'School-Defined / Custom Syllabus',
    label: 'School-Defined / Custom Syllabus',
    category: 'Custom',
    searchTags: ['custom', 'school', 'internal', 'private'],
  },
];
