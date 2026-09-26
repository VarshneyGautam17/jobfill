// AutoFill Assistant — shared constants for the content-script pipeline.
// Loaded as a plain script (no bundler); exposes window.JobFillConstants.
(function () {
  const FIELD_TYPES = {
    FIRST_NAME: 'FIRST_NAME',
    MIDDLE_NAME: 'MIDDLE_NAME',
    LAST_NAME: 'LAST_NAME',
    FULL_NAME: 'FULL_NAME',

    EMAIL: 'EMAIL',
    PHONE: 'PHONE',

    ADDRESS: 'ADDRESS',
    CITY: 'CITY',
    STATE: 'STATE',
    COUNTRY: 'COUNTRY',
    ZIP_CODE: 'ZIP_CODE',

    JOB_TITLE: 'JOB_TITLE',
    COMPANY: 'COMPANY',
    EXPERIENCE: 'EXPERIENCE',
    SUMMARY: 'SUMMARY',
    JOB_LOCATION: 'JOB_LOCATION',
    JOB_DESCRIPTION: 'JOB_DESCRIPTION',
    JOB_START_DATE: 'JOB_START_DATE',
    JOB_END_DATE: 'JOB_END_DATE',
    CURRENTLY_WORKING: 'CURRENTLY_WORKING',

    LINKEDIN: 'LINKEDIN',
    GITHUB: 'GITHUB',
    PORTFOLIO: 'PORTFOLIO',
    STACKOVERFLOW: 'STACKOVERFLOW',
    WEBSITE: 'WEBSITE',

    SKILLS: 'SKILLS',

    RESUME: 'RESUME',

    DEGREE: 'DEGREE',
    UNIVERSITY: 'UNIVERSITY',
    FIELD_OF_STUDY: 'FIELD_OF_STUDY',
    GRAD_YEAR: 'GRAD_YEAR',

    EXPECTED_SALARY: 'EXPECTED_SALARY',
    CURRENT_SALARY: 'CURRENT_SALARY',
    NOTICE_PERIOD: 'NOTICE_PERIOD',

    WORK_AUTHORIZATION: 'WORK_AUTHORIZATION',
    RELOCATION: 'RELOCATION',
    REMOTE_PREFERENCE: 'REMOTE_PREFERENCE',
    SPONSORSHIP: 'SPONSORSHIP',
    EMPLOYMENT_TYPE: 'EMPLOYMENT_TYPE'
  };

  // Maps a FIELD_TYPE to a dot-path inside the active profile object.
  // RESUME is deliberately absent — its value isn't a flat string at a dot
  // path, it's a whole file object picked out of profile.resumes[] (see
  // JobFillUtils.getActiveResume), so mapper.js special-cases it instead.
  const PROFILE_PATHS = {
    FIRST_NAME: 'personal.firstName',
    MIDDLE_NAME: 'personal.middleName',
    LAST_NAME: 'personal.lastName',
    FULL_NAME: 'personal.fullName',
    EMAIL: 'personal.email',
    PHONE: 'personal.phone',
    ADDRESS: 'personal.address',
    CITY: 'personal.city',
    STATE: 'personal.state',
    COUNTRY: 'personal.country',
    ZIP_CODE: 'personal.zip',

    JOB_TITLE: 'professional.jobTitle',
    COMPANY: 'professional.company',
    EXPERIENCE: 'professional.experienceYears',
    SUMMARY: 'professional.summary',
    JOB_LOCATION: 'professional.location',
    JOB_DESCRIPTION: 'professional.description',
    JOB_START_DATE: 'professional.startDate',
    JOB_END_DATE: 'professional.endDate',
    CURRENTLY_WORKING: 'professional.currentlyWorking',
    SKILLS: 'professional.skills',
    EXPECTED_SALARY: 'professional.expectedSalary',
    CURRENT_SALARY: 'professional.currentSalary',
    NOTICE_PERIOD: 'professional.noticePeriod',
    EMPLOYMENT_TYPE: 'professional.employmentType',

    LINKEDIN: 'links.linkedin',
    GITHUB: 'links.github',
    PORTFOLIO: 'links.portfolio',
    STACKOVERFLOW: 'links.stackoverflow',
    WEBSITE: 'links.website',

    DEGREE: 'education.degree',
    UNIVERSITY: 'education.university',
    FIELD_OF_STUDY: 'education.fieldOfStudy',
    GRAD_YEAR: 'education.endYear',

    WORK_AUTHORIZATION: 'preferences.workAuthorization',
    RELOCATION: 'preferences.relocation',
    REMOTE_PREFERENCE: 'preferences.remotePreference',
    SPONSORSHIP: 'preferences.sponsorship'
  };

  // Human labels for the "unknown field" picker and mapping UI.
  const FIELD_LABELS = {
    FIRST_NAME: 'First Name',
    MIDDLE_NAME: 'Middle Name',
    LAST_NAME: 'Last Name',
    FULL_NAME: 'Full Name',
    EMAIL: 'Email',
    PHONE: 'Phone',
    ADDRESS: 'Address',
    CITY: 'City',
    STATE: 'State',
    COUNTRY: 'Country',
    ZIP_CODE: 'ZIP / Postal Code',
    JOB_TITLE: 'Job Title',
    COMPANY: 'Current Company',
    EXPERIENCE: 'Years of Experience',
    SUMMARY: 'Professional Summary',
    JOB_LOCATION: 'Job Location',
    JOB_DESCRIPTION: 'Job Description',
    JOB_START_DATE: 'Job Start Date',
    JOB_END_DATE: 'Job End Date',
    CURRENTLY_WORKING: 'Currently Working Here',
    SKILLS: 'Skills',
    RESUME: 'Resume / CV Upload',
    LINKEDIN: 'LinkedIn',
    GITHUB: 'GitHub',
    PORTFOLIO: 'Portfolio',
    STACKOVERFLOW: 'Stack Overflow',
    WEBSITE: 'Personal Website',
    DEGREE: 'Degree',
    UNIVERSITY: 'University / College',
    FIELD_OF_STUDY: 'Field of Study',
    GRAD_YEAR: 'Graduation Year',
    EXPECTED_SALARY: 'Expected Salary',
    CURRENT_SALARY: 'Current Salary',
    NOTICE_PERIOD: 'Notice Period',
    WORK_AUTHORIZATION: 'Work Authorization',
    RELOCATION: 'Willing to Relocate',
    REMOTE_PREFERENCE: 'Remote Preference',
    SPONSORSHIP: 'Requires Sponsorship',
    EMPLOYMENT_TYPE: 'Employment Type'
  };

  // Weighted keyword signals per field type. Matching is done against
  // normalized (lowercase, word-split) name/id/placeholder/label/aria text.
  // "ac" = matching autocomplete token(s). "type" = native input type match.
  const FIELD_SIGNALS = {
    FIRST_NAME: { words: ['first name', 'firstname', 'fname', 'given name'], ac: ['given-name'] },
    MIDDLE_NAME: { words: ['middle name', 'middlename', 'mname'], ac: ['additional-name'] },
    LAST_NAME: { words: ['last name', 'lastname', 'lname', 'surname', 'family name'], ac: ['family-name'] },
    FULL_NAME: { words: ['full name', 'fullname', 'your name', 'candidate name', 'applicant name', 'legal name'], ac: ['name'] },

    EMAIL: { words: ['email', 'e mail', 'emailaddress', 'email address'], ac: ['email'], type: ['email'] },
    PHONE: { words: ['phone', 'mobile', 'telephone', 'contact number', 'phone number', 'cell'], ac: ['tel'], type: ['tel'] },

    ADDRESS: { words: ['address', 'street address', 'addressline1', 'address line 1', 'street'], ac: ['address-line1', 'street-address'] },
    CITY: { words: ['city', 'town'], ac: ['address-level2'] },
    STATE: { words: ['state', 'province', 'region'], ac: ['address-level1'] },
    COUNTRY: { words: ['country', 'nation'], ac: ['country', 'country-name'] },
    ZIP_CODE: { words: ['zip', 'zipcode', 'zip code', 'postal code', 'postalcode', 'pincode', 'pin code'], ac: ['postal-code'] },

    JOB_TITLE: { words: ['job title', 'jobtitle', 'current title', 'designation', 'position', 'current role', 'role'], ac: ['organization-title'] },
    COMPANY: { words: ['company', 'employer', 'current company', 'organization', 'organisation'], ac: ['organization'] },
    EXPERIENCE: { words: ['experience', 'years of experience', 'yoe', 'total experience', 'work experience'] },
    SUMMARY: { words: ['summary', 'about you', 'about yourself', 'professional summary', 'bio', 'cover letter', 'message', 'tell us about'] },

    // Repeatable "Add Experience" entry fields (title/company are already
    // covered by JOB_TITLE/COMPANY above and reused for these forms too).
    // "From"/"To" alone are deliberately NOT included as keywords here —
    // they're too generic (notice-period ranges, availability windows,
    // price ranges, etc. all use the same words) and would misfire on
    // unrelated date fields elsewhere on a page. Those fall to the widget's
    // manual picker instead, which is a one-time fix per site (see mapper.js
    // learned mappings).
    JOB_LOCATION: { words: ['office location', 'job location', 'work location', 'location'] },
    JOB_DESCRIPTION: { words: ['job description', 'role description', 'description', 'responsibilities'] },
    JOB_START_DATE: { words: ['start date', 'from date', 'joining date', 'date of joining', 'employment start date'] },
    JOB_END_DATE: { words: ['end date', 'to date', 'date of leaving', 'last working day', 'employment end date'] },
    CURRENTLY_WORKING: { words: ['currently work here', 'i currently work here', 'currently working here', 'still working here', 'i currently work in this role'] },

    LINKEDIN: { words: ['linkedin', 'linked in'] },
    GITHUB: { words: ['github', 'git hub'] },
    PORTFOLIO: { words: ['portfolio', 'portfolio url', 'work samples'] },
    STACKOVERFLOW: { words: ['stackoverflow', 'stack overflow'] },
    WEBSITE: { words: ['website', 'personal website', 'personal site', 'homepage'], ac: ['url'] },

    SKILLS: { words: ['skills', 'key skills', 'technical skills', 'core competencies', 'technologies'] },

    RESUME: { words: ['resume', 'résumé', 'cv', 'curriculum vitae', 'upload resume', 'attach resume', 'upload cv', 'attach cv', 'upload your resume'] },

    DEGREE: { words: ['degree', 'qualification', 'highest degree'] },
    UNIVERSITY: { words: ['university', 'college', 'institute', 'school name', 'alma mater'] },
    FIELD_OF_STUDY: { words: ['field of study', 'major', 'specialization', 'stream', 'branch'] },
    GRAD_YEAR: { words: ['graduation year', 'grad year', 'year of graduation', 'passing year', 'end year'] },

    EXPECTED_SALARY: { words: ['expected salary', 'expected ctc', 'salary expectation', 'desired salary', 'expectedsalary'] },
    CURRENT_SALARY: { words: ['current salary', 'current ctc', 'annual ctc', 'existing salary', 'presentsalary', 'ctc'] },
    NOTICE_PERIOD: { words: ['notice period', 'noticeperiod', 'availability to join', 'joining time'] },

    WORK_AUTHORIZATION: { words: ['work authorization', 'work authorisation', 'authorized to work', 'legally authorized', 'visa status', 'work permit', 'work auth', 'workauth', 'employment eligibility', 'eligible to work'] },
    RELOCATION: { words: ['relocate', 'relocation', 'willing to relocate'] },
    REMOTE_PREFERENCE: { words: ['remote', 'work from home', 'wfh preference', 'remote preference'] },
    SPONSORSHIP: { words: ['sponsorship', 'require sponsorship', 'visa sponsorship'] },
    EMPLOYMENT_TYPE: { words: ['employment type', 'job type', 'contract type', 'full time or part time'] }
  };

  // Fields AutoFill Assistant must never auto-fill, regardless of confidence.
  const SENSITIVE_PATTERNS = [
    'password', 'pwd', 'passcode', 'pass code',
    'otp', 'one time password', 'onetimepassword', 'one time pin',
    'cvv', 'cvc', 'security code', 'securitycode',
    'credit card', 'creditcard', 'card number', 'cardnumber',
    'bank account', 'bankaccount', 'account number', 'ifsc',
    'upi pin', 'upipin', 'atm pin', 'mpin', 'auth code', 'authcode',
    'social security', 'ssn', 'aadhaar', 'aadhar', 'passport number'
  ];

  const CONFIDENCE = {
    HIGH: 85,
    MEDIUM: 60
  };

  // Hard safety cap. A page reporting more fields than this is almost
  // certainly not a real job application form but something pathological
  // (a component library exposing internal implementation-detail inputs
  // through Shadow DOM, a page that mutates constantly, etc.) — past this
  // point AutoFill Assistant stops scanning/observing that page entirely rather than
  // risk degrading it further.
  const MAX_DETECTED_FIELDS = 50;

  const DEFAULT_SETTINGS = {
    showWidget: true,
    autoDetectForms: true,
    autoFillOnDetect: false,
    confirmBeforeAutofill: false,
    fillHighConfidence: true,
    fillMediumConfidence: true,
    askBeforeMedium: false,
    theme: 'system'
  };

  window.JobFillConstants = {
    FIELD_TYPES,
    PROFILE_PATHS,
    FIELD_LABELS,
    FIELD_SIGNALS,
    SENSITIVE_PATTERNS,
    CONFIDENCE,
    DEFAULT_SETTINGS,
    MAX_DETECTED_FIELDS
  };
})();
