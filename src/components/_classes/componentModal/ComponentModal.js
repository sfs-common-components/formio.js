import _ from 'lodash';
import { fastCloneDeep } from '../../../utils/utils';

export default class ComponentModal {
  static render(component, data, topLevel) {
    const children = component.renderTemplate('component', data, topLevel);
    const isOpened = this;
    return component.renderTemplate('componentModal', {
      ...data,
      children,
      isOpened
    });
  }

  constructor(component, element, isOpened, currentValue) {
    this.isOpened = isOpened;
    this.component = component;
    this.element = element;
    this.currentValue = fastCloneDeep(currentValue);
    this.dataLoaded = false;
    this.init();
  }

  get refs() {
    return this.component.refs;
  }

  init() {
    this.openModalListener = this.openModalHandler.bind(this);
    this.showDialogListener = (event) => {
      if (this.isValueChanged() && !this.component.disabled) {
        this.showDialog();
      }
      else {
        this.closeModalHandler(event);
      }
    };
    this.closeModalListener = this.closeModalHandler.bind(this);
    this.saveModalListener = this.saveModalValueHandler.bind(this);
    this.closeDialogListener = this.closeDialog.bind(this);
    this.saveDialogListener = this.saveDialog.bind(this);
    this.loadRefs();
  }

  setValue(value) {
    if (this.dataLoaded) {
      return;
    }

    this.currentValue = fastCloneDeep(value);
    this.dataLoaded = true;
    this.updateView();
  }

  setOpenModalElement(template) {
    this.openModalTemplate = template;
    this.component.setContent(this.openModalWrapperRef, template);
    this.loadRefs();
    this.setEventListeners();
    if (this.isOpened) {
      this.refs.modalWrapper.classList.add('formio-dialog-disabled-animation');
      this.openModal();
    }
  }

  get templateRefs() {
    return {
      [`modalClose-${this.component.id}`]: 'single',
      [`openModalWrapper-${this.component.id}`]: 'single',
      [`modalSave-${this.component.id}`]: 'single',
      modalOverlay: 'single',
      modalContents: 'single',
      openModal: 'single',
      modalWrapper: 'single',
    };
  }

  get modalCloseRef() {
    return this.refs[`modalClose-${this.component.id}`];
  }

  get openModalWrapperRef() {
    return this.refs[`openModalWrapper-${this.component.id}`];
  }

  get modalSaveRef() {
    return this.refs[`modalSave-${this.component.id}`];
  }

  loadRefs() {
    this.component.loadRefs(this.element, this.templateRefs);
  }

  removeEventListeners() {
    this.component.removeEventListener(this.refs.openModal, 'click', this.openModalListener);
    this.component.removeEventListener(this.refs.modalOverlay, 'click', this.modalSaveRef ? this.showDialogListener : this.saveModalListener);
    this.component.removeEventListener(this.modalCloseRef, 'click', this.showDialogListener);
    this.component.removeEventListener(this.modalSaveRef, 'click', this.saveModalListener);
  }

  setEventListeners() {
    this.removeEventListeners();
    this.component.addEventListener(this.refs.openModal, 'click', this.openModalListener);
    this.component.addEventListener(this.refs.modalOverlay, 'click', this.modalSaveRef ? this.showDialogListener : this.saveModalListener);
    this.component.addEventListener(this.modalCloseRef, 'click', this.showDialogListener);
    this.component.addEventListener(this.modalSaveRef, 'click', this.saveModalListener);
  }

  isValueChanged() {
    let componentValue = this.component.getValue();
    let currentValue = this.currentValue;

    //excluding metadata comparison for components that have it in dataValue (for ex. nested forms)
    if (componentValue && componentValue.data && componentValue.metadata) {
      componentValue = this.component.getValue().data;
      currentValue = this.currentValue.data;
    }

    return !_.isEqual(componentValue, currentValue);
  }

  setOpenEventListener() {
    this.component.removeEventListener(this.refs.openModal, 'click', this.openModalListener);
    this.component.loadRefs(this.openModalWrapperRef, {
      'openModal': 'single',
    });
    this.component.addEventListener(this.refs.openModal, 'click', this.openModalListener);
  }

  openModalHandler(event) {
    event.preventDefault();
    this.openModal();
  }

  positionOverElement() {
    // Position the modal just over the element on the page.
    const elementOffset = this.element.getBoundingClientRect().top;
    const modalHeight = this.refs.modalContents.getBoundingClientRect().height;
    let modalTop = elementOffset - modalHeight - 10;
    modalTop = modalTop > 0 ? modalTop : 10;
    this.refs.modalWrapper.style.paddingTop = `${modalTop}px`;
  }

  openModal() {
    this.isOpened = true;
    this.refs.modalWrapper.classList.remove('component-rendering-hidden');
    if (this.component.component.type === 'signature') {
      // Position signature modals just above the signature button.
      this.positionOverElement();
    }
  }

  updateView() {
    const template = _.isEqual(this.currentValue, this.component.defaultValue)
      ? this.openModalTemplate
      : this.component.getModalPreviewTemplate();
    this.component.setContent(this.openModalWrapperRef, template);
    this.setOpenEventListener();
  }

  closeModal() {
    this.refs.modalWrapper.classList.remove('formio-dialog-disabled-animation');
    this.refs.modalWrapper.classList.add('component-rendering-hidden');
    this.isOpened = false;
    this.updateView();
  }

  closeModalHandler(event) {
    event.preventDefault();
    if (!this.component.disabled) {
      this.component.setValue(_.cloneDeep(this.currentValue), { resetValue: true });
    }
    this.closeModal();
  }

  showDialog() {
    this.dialogElement = this.component.ce('div');
    const dialogContent = `
      <h3 ref="dialogHeader">${this.component.t('Do you want to clear changes?')}</h3>
      <div style="display:flex; justify-content: flex-end;">
        <button ref="dialogCancelButton" class="btn btn-secondary">${this.component.t('Cancel')}</button>
        <button ref="dialogYesButton" class="btn btn-danger">${this.component.t('Yes, delete it')}</button>
      </div>
    `;

    this.dialogElement.innerHTML = dialogContent;
    this.dialogElement.refs = {};
    this.component.loadRefs.call(this.dialogElement, this.dialogElement, {
      dialogHeader: 'single',
      dialogCancelButton: 'single',
      dialogYesButton: 'single',
    });

    this.dialog = this.component.createModal(this.dialogElement);
    this.component.addEventListener(this.dialogElement.refs.dialogYesButton, 'click', this.saveDialogListener);
    this.component.addEventListener(this.dialogElement.refs.dialogCancelButton, 'click', this.closeDialogListener);
  }

  closeDialog(event) {
    event.preventDefault();
    this.dialog.close();
    this.component.removeEventListener(this.dialogElement.refs.dialogYesButton, 'click', this.saveDialogListener);
    this.component.removeEventListener(this.dialogElement.refs.dialogCancelButton, 'click', this.closeDialogListener);
  }

  saveDialog(event) {
    this.closeDialog(event);
    this.closeModalHandler(event);
  }

  saveModalValueHandler(event) {
    event.preventDefault();
    this.currentValue = fastCloneDeep(this.component.dataValue);
    this.closeModal();
  }
}
