// js/appointment_add_form.js

(function ($, Drupal, once) {
    'use strict';
  
    // --- Main Behavior for the Appointment Add Form ---
    Drupal.behaviors.appointmentAddForm = {
      attach: function (context, settings) {
        // Correctly use once() by passing the jQuery object to it.
        const formElements = once('appointment-form-init', $(context).find('form.node-appointment-form'));
  
        formElements.forEach(function (form) {
          const $form = $(form);
          // Run all our enhancement functions.
          displaySlotTimes($form);
          disableReservedSlots($form);
          initializeSlotCoverageValidation($form);
          initializeBadgePendingHints($form);
        });
      }
    };
  
    // ... (the rest of the functions in this file remain the same) ...
  
    // --- Function to display calculated times next to slot labels ---
    function displaySlotTimes(form) {
      const slotLabels = form.find('#edit-field-appointment-slot .form-item__label.option');
      if (!slotLabels.length) return;
  
      const urlParams = new URLSearchParams(window.location.search);
      const startTime = urlParams.get('start_time');
      if (!startTime) return;
  
      const timeParts = startTime.match(/(\d+):(\d+)(am|pm)/i);
      if (!timeParts) return;
  
      let hours = parseInt(timeParts[1], 10);
      let minutes = parseInt(timeParts[2], 10);
      if (timeParts[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
      if (timeParts[3].toLowerCase() === 'am' && hours === 12) hours = 0;
  
      const baseDate = new Date();
      baseDate.setHours(hours, minutes, 0, 0);
  
      slotLabels.each(function (index) {
        const slotTime = new Date(baseDate.getTime() + (index * 30 * 60 * 1000));
        const h = slotTime.getHours() % 12 || 12;
        const m = String(slotTime.getMinutes()).padStart(2, '0');
        const ampm = slotTime.getHours() >= 12 ? 'pm' : 'am';
  
        // Prevent adding duplicate times on AJAX rebuilds
        if ($(this).find('.calculated-time').length === 0) {
          $(this).append(`<span class="calculated-time" style="color:green; margin-left: 5px;">(${h}:${m}${ampm})</span>`);
        }
      });
    }
  
    // --- Function to disable slots that are already reserved ---
    function disableReservedSlots(form) {
      const reservedSlots = $('.view-id-scheduled_appointment_slots .views-row');
      const appointmentDate = form.find('input[name="field_appointment_date[0][value]"]').val();
      if (!reservedSlots.length || !appointmentDate) return;
  
      reservedSlots.each(function () {
        const row = $(this);
        const slotKey = row.find('.views-field-field-appointment-slot-1 .field-content').text().trim();
        const slotDate = row.find('.views-field-field-appointment-date time').attr('datetime').split('T')[0];
  
        if (appointmentDate === slotDate) {
          const slotInput = form.find(`#edit-field-appointment-slot input[value="${slotKey}"]`);
          if (slotInput.length) {
            slotInput.prop('disabled', true);
            slotInput.closest('.js-form-item').css({ color: 'gray', 'text-decoration': 'line-through' });
          }
        }
      });
  
      // Check if all slots are disabled and show a message
      const allSlots = form.find('#edit-field-appointment-slot input[type="checkbox"]');
      const allDisabled = allSlots.length > 0 && allSlots.filter(':enabled').length === 0;
  
      if (allDisabled && form.find('.all-slots-taken-message').length === 0) {
          const message = $('<p class="all-slots-taken-message" style="color: red; font-weight: bold;">All time slots are reserved for this day.</p>');
          form.find('#edit-field-appointment-slot').before(message);
      }
    }
  
    // --- Functions for validating slot coverage based on badge time ---
    function initializeSlotCoverageValidation(form) {
      const purposeField = form.find('input[name="field_appointment_purpose"]');
      const badgeCheckboxes = form.find('#edit-field-appointment-badges input[type="checkbox"]');
      const slotCheckboxes = form.find('#edit-field-appointment-slot input[type="checkbox"]');
  
      function checkCoverage() {
        const purpose = form.find('input[name="field_appointment_purpose"]:checked').val();
        const errorDivId = 'slot-error-message';
        let errorDiv = $(`#${errorDivId}`);
  
        if (purpose !== 'checkout') {
          if (errorDiv.length) errorDiv.remove();
          return true;
        }
  
        let totalBadgeMinutes = 0;
        badgeCheckboxes.filter(':checked').each(function () {
          const label = $(this).closest('.js-form-item').find('label');
          const minutesSpan = label.find('.views-field-field-badge-checkout-minutes .field-content');
          if (minutesSpan.length) {
            const minutesMatch = minutesSpan.text().match(/(\d+)/);
            if (minutesMatch) totalBadgeMinutes += parseInt(minutesMatch[1], 10);
          }
        });
  
        const selectedSlots = slotCheckboxes.filter(':checked').length;
        const totalSlotMinutes = selectedSlots * 30;
  
        if (errorDiv.length === 0) {
          errorDiv = $(`<div id="${errorDivId}" style="color: red; margin-bottom: 10px;"></div>`);
          form.find('#edit-field-appointment-slot-wrapper').before(errorDiv);
        }
  
        if (totalBadgeMinutes > totalSlotMinutes) {
          errorDiv.text(`Please select enough slots (${totalSlotMinutes} min) to cover the required badge time of ${totalBadgeMinutes} minutes.`);
          return false;
        } else {
          errorDiv.text('');
          return true;
        }
      }
  
      // When purpose changes away from checkout, clear any selected badges so
      // stale selections can't trigger hidden validation errors on submit.
      purposeField.on('change', function () {
        const purpose = form.find('input[name="field_appointment_purpose"]:checked').val();
        if (purpose !== 'checkout') {
          badgeCheckboxes.prop('checked', false);
        }
        checkCoverage();
      });
      badgeCheckboxes.on('change', checkCoverage);
      slotCheckboxes.on('change', checkCoverage);
      checkCoverage(); // Initial check on page load
  
      // Validate on form submission
      form.on('submit', function (event) {
        if (!checkCoverage()) {
          event.preventDefault();
          alert('Please select enough time slots to cover the total required time for the selected badges.');
        }
      });
    }
  
    // --- Pending badge hints: annotate checkboxes and show summary ---
    function initializeBadgePendingHints(form) {
      const settings = (drupalSettings && drupalSettings.appointmentFacilitator) ? drupalSettings.appointmentFacilitator : {};
      const pendingTids = new Set((settings.pendingBadgeTids || []).map(Number));
      const pendingBadgeData = settings.pendingBadgeData || {};
      const allBadgeUrls = settings.allBadgeUrls || {};

      const badgesWrapper = form.find('#edit-field-appointment-badges');
      if (!badgesWrapper.length) return;

      // Annotate each badge checkbox with pending status and a link.
      badgesWrapper.find('input[type="checkbox"]').each(function () {
        const tid = parseInt($(this).val(), 10);
        if (isNaN(tid)) return;
        const item = $(this).closest('.js-form-item');
        if (item.find('.badge-status-hint').length) return;

        if (pendingTids.has(tid)) {
          item.append('<span class="badge-status-hint" style="color:#2e7d32; font-size:0.85em; margin-left:6px;">&#10003; pending</span>');
        } else {
          const url = allBadgeUrls[String(tid)];
          const linkHtml = url ? ' &mdash; <a href="' + url + '" target="_blank" rel="noopener">view requirements</a>' : '';
          item.append('<span class="badge-status-hint" style="color:#888; font-size:0.85em; margin-left:6px;">not pending' + linkHtml + '</span>');
        }
      });

      // Summary box shown above the list when purpose = checkout.
      const hintId = 'badge-pending-summary';
      if (!form.find('#' + hintId).length) {
        badgesWrapper.before('<div id="' + hintId + '" style="display:none; margin-bottom:8px;"></div>');
      }

      function updateSummary() {
        const purpose = form.find('input[name="field_appointment_purpose"]:checked').val();
        const hintDiv = form.find('#' + hintId);

        if (purpose !== 'checkout') {
          hintDiv.hide().html('');
          return;
        }

        const keys = Object.keys(pendingBadgeData);
        if (keys.length === 0) {
          hintDiv.html(
            '<p style="margin:0;padding:8px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;color:#664d03;">' +
            'You have no badges currently pending. Badges must be pending on your profile before they can be checked out.' +
            '</p>'
          ).show();
        } else {
          const links = keys.map(function (tid) {
            const b = pendingBadgeData[tid];
            return '<a href="' + b.url + '" target="_blank" rel="noopener">' + b.label + '</a>';
          }).join(', ');
          hintDiv.html(
            '<p style="margin:0;padding:8px 12px;background:#d1e7dd;border:1px solid #a3cfbb;border-radius:4px;color:#0a3622;">' +
            'Your pending badges: ' + links +
            '</p>'
          ).show();
        }
      }

      form.find('input[name="field_appointment_purpose"]').on('change', updateSummary);
      updateSummary();
    }

  })(jQuery, Drupal, once);