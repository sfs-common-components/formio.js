
//select is a custom component , in order to differentiate between form.io 's select component we have used 'selectF'
//changed group and weight to reorder components
//tabs & functionalities are removed

export default [
  {
    key: 'placeholder',
    ignore: true
  },
  {
    type: 'checkbox',
    label: 'Allow Serial Number',
    key: 'serialNumber',
    tooltip: 'Check if you want to add serial number',
    weight: 405,
    input: true,
  },
  {
    type: 'checkbox',
    label: 'Disable Adding Rows',
    key: 'disableAddingRows',
    tooltip: 'Check if you want to hide Add Another button',
    weight: 405,
    input: true,
    clearOnHide: false,
    customConditional(context) {
      return !context.data.enableRowGroups;
    },
    calculateValue(context) {
      return context.data.enableRowGroups ? true : context.data.disableAddingRows;
    },
  },
  {
    type: 'checkbox',
    label: 'Allow Clone Row',
    key: 'cloneRow',
    weight: 407,
    input: true,
    clearOnHide: false,
    customConditional(context) {
      return context.data.disableAddingRows ? false : true;
    },
    calculateValue(context) {
      return context.data.disableAddingRows ? false : context.data.cloneRow;
    },
  },
  {
    type: 'checkbox',
    label: 'Disable Removing Rows',
    key: 'disableRemovingRows',
    tooltip: 'Check if you want to hide Remove Row button',
    weight: 405,
    input: true,
    clearOnHide: false,
    customConditional(context) {
      return !context.data.enableRowGroups;
    },
    calculateValue(context) {
    return context.data.enableRowGroups ? true :  context.data.disableRemovingRows;
    },
  },
  // {
  //   weight: 406,
  //   type: 'textarea',
  //   input: true,
  //   key: 'conditionalAddButton',
  //   label: 'Conditional Add Button',
  //   placeholder: 'show = ...',
  //   tooltip: 'Specify condition when Add Button should be displayed.',
  //   editor: 'ace',
  //   as: 'javascript',
  //   wysiwyg: {
  //     minLines: 3,
  //   },
  // },
  {
    type: 'checkbox',
    label: 'Allow Reorder',
    key: 'reorder',
    weight: 407,
    input: true,
  },
  {
    type: 'textfield',
    label: 'Add Another Text',
    key: 'addAnother',
    tooltip: 'Set the text of the Add Another button.',
    placeholder: 'Add Another',
    weight: 410,
    builderEdit:true,
    input: true,
    customConditional(context) {
      return !context.data.disableAddingRows;
    }
  },
  {
    type: 'selectF',
    label: 'Add Another Position',
    key: 'addAnotherPosition',
    dataSrc: 'values',
    tooltip: 'Position for Add Another button with respect to Data Grid Array.',
    defaultValue: 'bottom',
    input: true,
    data: {
      values: [
        { label: 'Top', value: 'top' },
        { label: 'Bottom', value: 'bottom' },
        { label: 'Both', value: 'both' }
      ]
    },
    weight: 411,
    customConditional(context) {
      return !context.data.disableAddingRows;
    }
  },
  // {
  //   type: 'checkbox',
  //   label: 'Equal column width',
  //   key: 'layoutFixed',
  //   weight: 430,
  //   input: true,
  // },
  {
    key: 'enableRowGroups',
    type: 'checkbox',
    label: 'Enable Row Groups',
    weight: 440,
    input: true
  },
  {
    key: 'hideRowGroupsInitially',
    type: 'checkbox',
    label: 'Hide Row Groups Initially',
    weight: 441,
    input: true
  },
  {
    label: 'Groups',
    disableAddingRemovingRows: false,
    disableAddingRows: false,
    disableRemovingRows: false,

    defaultOpen: false,
    addAnother: '',
    addAnotherPosition: 'bottom',
    mask: false,
    tableView: true,
    alwaysEnabled: false,
    type: 'datagrid',
    input: true,
    key: 'rowGroups',
    reorder: true,
    components: [
      {
        label: 'Label',
        allowMultipleMasks: false,
        showWordCount: false,
        showCharCount: false,
        tableView: true,
        alwaysEnabled: false,
        type: 'textfield',
        input: true,
        builderEdit:true,
        key: 'label',
        widget: {
          type: ''
        },
        row: '0-0'
      },
      {
        label: 'Number of Rows',
        mask: false,
        tableView: true,
        alwaysEnabled: false,
        type: 'number',
        input: true,
        builderEdit:true,
        key: 'numberOfRows',
        row: '0-1'
      }
    ],
    weight: 443,
    conditional: { json: { var: 'data.enableRowGroups' } }
  },
  {
    label: 'Hide Group on Header Click',
    type: 'checkbox',
    input: true,
    key: 'groupToggle',
    weight: 443,
    conditional: { json: { var: 'data.enableRowGroups' } }
  },
  {
    label: 'Enable Inline Row Editing',
    type: 'checkbox',
    input: true,
    key: 'inlineEdit',
    tooltip: 'All the rows will be disabled except the one which is editing.',
    weight: 450
  },{
    label:'Enable Modal Edit',
    type: 'checkbox',
    input: true,
    key: 'modalEditEnabled',
    weight: 450
  },
//   {
//     key: 'enableColumnGroup',
//     type: 'checkbox',
//     label: 'Enable Column Group',
//     weight: 451,
//     input: true
//   },
//   {
//     label: 'Column groups',
//     disableAddingRemovingRows: false,
//     disableAddingRows: false,
//     disableRemovingRows: false,
//     defaultOpen: false,
//     addAnother: '',
//     addAnotherPosition: 'bottom',
//     mask: false,
//     tableView: true,
//     alwaysEnabled: false,
//     type: 'datagrid',
//     input: true,
//     key: 'clmGrp',
//     // reorder: true,
//     components: [
//       {
//         "label": "Column Name",
//         "allowMultipleMasks": false,
//         "showWordCount": false,
//         "showCharCount": false,
//         "tableView": true,
//         "alwaysEnabled": false,
//         "type": "textfield",
//         "input": true,
//         "builderEdit": true,
//         "key": "name",
//         "widget": {
//           "type": ""
//         },
//         "validate": {
//           "custom": "if (!row.name) { \
//             return false \
//           } else { return true; }",
//           "customMessage": "This field cannot be left empty"
//         }
//       },
//       {
//         "label": "Starting Column Number",
//         "mask": false,
//         "tableView": true,
//         "alwaysEnabled": false,
//         "type": "number",
//         "input": true,
//         "builderEdit": true,
//         "key": "from",
//        "validate":{
//     "custom": "if (row && data.clmGrp) { \
//         let overlap = false; \
//         let prevRow = null; \
//         if(row.from<=0){\
//         return false;\
//         }\
//         data.clmGrp.forEach((ele, i) => { \
//             if (prevRow) { \
//                 if ((!row.to || row.to==ele.to) &&row.from <= prevRow.to) { \
//                     overlap = true; \
//                 } \
//             } \
//             prevRow = ele; \
//         }); \
//         return !overlap; \
//     } else { \
//         return true; \
//     }",
//     "customMessage": "The starting index must be greater than 0 and cannot overlap with any previously entered indices"
// }
//       },
//       {
//         "label": "Ending Column Number",
//         "mask": false,
//         "tableView": true,
//         "alwaysEnabled": false,
//         "type": "number",
//         "input": true,
//         "builderEdit": true,
//         "key": "to",
//         "validate": {
//           "custom": "if (row && data.clmGrp) { \
//             return row.to > row.from; \
//           } else { return true; }",
//           "customMessage": "Ending index must be greater than or equal to the starting index"
//         }
//       }
//     ],
//     weight: 452,
//     conditional: { json: { var: 'data.enableColumnGroup' } }
//   }
];
