// JobFill — shared constants for the content-script pipeline.
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

    LINKEDIN: 'LINKEDIN',
    GITHUB: 'GITHUB',
    PORTFOLIO: 'PORTFOLIO',
    STACKOVERFLOW: 'STACKOVERFLOW',
    WEBSITE: 'WEBSITE',

    SKILLS: 'SKILLS',

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
    SKILLS: 'Skills',
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

    LINKEDIN: { words: ['linkedin', 'linked in'] },
    GITHUB: { words: ['github', 'git hub'] },
    PORTFOLIO: { words: ['portfolio', 'portfolio url', 'work samples'] },
    STACKOVERFLOW: { words: ['stackoverflow', 'stack overflow'] },
    WEBSITE: { words: ['website', 'personal website', 'personal site', 'homepage'], ac: ['url'] },

    SKILLS: { words: ['skills', 'key skills', 'technical skills', 'core competencies', 'technologies'] },

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

  // Fields JobFill must never auto-fill, regardless of confidence.
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

  const DEFAULT_SETTINGS = {
    showWidget: true,
    autoDetectForms: true,
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
    DEFAULT_SETTINGS
  };
})();
