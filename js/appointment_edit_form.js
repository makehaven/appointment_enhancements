// js/appointment_edit_form.js

(function ($, Drupal, once) {
    'use strict';
  
    Drupal.behaviors.appointmentEditForm = {
      attach: function (context, settings) {
        // Correctly apply once() to the edit form.
        once('appointment-edit-init', $(context).find('form.node-appointment-edit-form')).forEach(function (form) {
          const $form = $(form); // Use jQuery object
          const readOnlyStyle = { 'background-color': '#e9ecef', 'pointer-events': 'none' };
  
          $form.find('#edit-title-0-value').prop('readonly', true).css(readOnlyStyle);
          $form.find('#edit-field-appointment-host-0-target-id').prop('readonly', true).css(readOnlyStyle);
          $form.find('#edit-field-appointment-date-0-value').prop('readonly', true).css(readOnlyStyle);
  
          $form.find('input[name="field_appointment_purpose"], #edit-field-appointment-slot input[type="checkbox"]').each(function() {
              $(this).prop('disabled', true);
          });
        });
      }
    };
  
  })(jQuery, Drupal, once);