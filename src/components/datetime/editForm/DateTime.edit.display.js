export default [
 {
    weight: 0,
    type: 'textfield',
    input: true,
    key: 'key',
    label: 'Property Name',
    tooltip: 'The name of this field in the API endpoint.',
    validate: {
      pattern: '(\\w|\\w[\\w-.]*\\w)',
      patternMessage: 'The property name must only contain alphanumeric characters, underscores, dots and dashes and should not be ended by dash or dot.',
      required: true
    }
  },
  {
    weight: 10,
    type: 'checkbox',
    label: 'Required',
    tooltip: 'A required field must be filled in before the form can be submitted.',
    key: 'validate.required',
    input: true
  },
  {
    weight: 100,
    type: 'textfield',
    input: true,
    key: 'placeholder',
    label: 'Placeholder',
    placeholder: 'Placeholder',
    tooltip: 'The placeholder text that will appear when this field is empty.'
  },
  {
    type: 'textfield',
    input: true,
    key: 'format',
    label: 'Format',
    placeholder: 'Format',
    description: 'Use formats provided by <a href="https://github.com/angular-ui/bootstrap/tree/master/src/dateparser/docs#uibdateparsers-format-codes" target="_blank">DateParser Codes</a>',
    tooltip: 'The date format for displaying the datetime value.',
    weight: 52
  },
];
