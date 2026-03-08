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
          initializeLargeSlotSelectionAdvisory($form);
          initializeBadgePendingHints($form);
        });
      }
    };
  
    // ... (the rest of the functions in this file remain the same) ...
  
    // --- Function to display calculated times next to slot labels ---
    function formatDisplayTime(date, timezone) {
      const formatted = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      }).format(date);
      return formatted.replace(/\s+/g, '').toLowerCase();
    }

    function resolveStartTimeDate(startTime, timezone) {
      const trimmed = String(startTime).trim();

      // Support Unix timestamps (seconds or milliseconds).
      if (/^\d+$/.test(trimmed)) {
        const numeric = parseInt(trimmed, 10);
        const millis = numeric > 100000000000 ? numeric : numeric * 1000;
        const byEpoch = new Date(millis);
        if (!isNaN(byEpoch.getTime())) {
          return byEpoch;
        }
      }

      // Support clock strings such as "10:00am".
      const timeParts = trimmed.match(/(\d+):(\d+)(am|pm)/i);
      if (timeParts) {
        const now = new Date();
        let baseHours = parseInt(timeParts[1], 10);
        const baseMinutes = parseInt(timeParts[2], 10);
        if (timeParts[3].toLowerCase() === 'pm' && baseHours !== 12) baseHours += 12;
        if (timeParts[3].toLowerCase() === 'am' && baseHours === 12) baseHours = 0;
        const local = new Date(now.getFullYear(), now.getMonth(), now.getDate(), baseHours, baseMinutes, 0, 0);
        if (!isNaN(local.getTime())) {
          return local;
        }
      }

      // Final fallback: native Date parser for ISO-like values.
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      return null;
    }

    function displaySlotTimes(form) {
      const slotLabels = form.find('#edit-field-appointment-slot .form-item__label.option');
      if (!slotLabels.length) return;
  
      const urlParams = new URLSearchParams(window.location.search);
      const startTime = urlParams.get('start_time');
      if (!startTime) return;

      const siteTimezone = (((window.drupalSettings || {}).appointment_facilitator || {}).siteTimezone) || 'America/New_York';
      const baseDate = resolveStartTimeDate(startTime, siteTimezone);
      if (!baseDate) return;
  
      slotLabels.each(function (index) {
        const slotDate = new Date(baseDate.getTime() + (index * 30 * 60000));
        const display = formatDisplayTime(slotDate, siteTimezone);
  
        // Prevent adding duplicate times on AJAX rebuilds
        if ($(this).find('.calculated-time').length === 0) {
          $(this).append(`<span class="calculated-time" style="color:green; margin-left: 5px;">(${display})</span>`);
        }
      });
    }

    function initializeLargeSlotSelectionAdvisory(form) {
      const slotCheckboxes = form.find('#edit-field-appointment-slot input[type="checkbox"]');
      if (!slotCheckboxes.length) return;

      const advisoryId = 'slot-consideration-message';
      if (!form.find('#' + advisoryId).length) {
        form.find('#edit-field-appointment-slot-wrapper').before(
          '<div id="' + advisoryId + '" style="display:none; margin-bottom:10px; color:#664d03; background:#fff3cd; border:1px solid #ffecb5; border-radius:4px; padding:8px 12px;">' +
          'You selected more than two slots. Facilitator time is valuable; please consider contacting your facilitator to confirm this amount of time works for them.' +
          '</div>'
        );
      }

      function updateAdvisory() {
        const selectedCount = slotCheckboxes.filter(':checked').length;
        form.find('#' + advisoryId).toggle(selectedCount > 2);
      }

      slotCheckboxes.on('change', updateAdvisory);
      updateAdvisory();
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
    function extractBadgeMinutes(checkbox) {
      const item = $(checkbox).closest('.js-form-item');
      const label = item.find('label').first();

      const minutesSpan = label.find('.views-field-field-badge-checkout-minutes .field-content').first();
      if (minutesSpan.length) {
        const minutesMatch = minutesSpan.text().match(/(\d+)/);
        if (minutesMatch) {
          return parseInt(minutesMatch[1], 10);
        }
      }

      // Fallback for simplified label markup like "Panel Saw-5 Minutes".
      const labelText = label.text().replace(/\s+/g, ' ').trim();
      const labelMinutes = labelText.match(/(\d+)\s*minutes?/i);
      if (labelMinutes) {
        return parseInt(labelMinutes[1], 10);
      }

      return 0;
    }

    function initializeSlotCoverageValidation(form) {
      const purposeField = form.find('input[name="field_appointment_purpose"]');
      const badgeCheckboxes = form.find('#edit-field-appointment-badges input[type="checkbox"]');
      const slotCheckboxes = form.find('#edit-field-appointment-slot input[type="checkbox"]');

      slotCheckboxes.each(function () {
        const slot = $(this);
        if (slot.data('original-disabled') === undefined) {
          slot.data('original-disabled', slot.prop('disabled'));
        }
      });

      function applySlotSelectionLock(requiredSlots, selectedSlots, isCheckout) {
        const shouldLock = isCheckout && requiredSlots > 0 && selectedSlots >= requiredSlots;
        slotCheckboxes.each(function () {
          const slot = $(this);
          const originalDisabled = !!slot.data('original-disabled');
          const checked = slot.is(':checked');

          if (originalDisabled) {
            return;
          }

          if (shouldLock && !checked) {
            slot.prop('disabled', true);
            slot.attr('data-slot-locked', '1');
            slot.closest('.js-form-item').css({ opacity: '0.55' });
          }
          else if (slot.attr('data-slot-locked') === '1') {
            slot.prop('disabled', false);
            slot.removeAttr('data-slot-locked');
            slot.closest('.js-form-item').css({ opacity: '' });
          }
        });
      }
  
      function checkCoverage() {
        const purpose = form.find('input[name="field_appointment_purpose"]:checked').val();
        const errorDivId = 'slot-error-message';
        let errorDiv = $(`#${errorDivId}`);
  
        if (purpose !== 'checkout') {
          if (errorDiv.length) errorDiv.remove();
          applySlotSelectionLock(0, 0, false);
          return true;
        }
  
        let totalBadgeMinutes = 0;
        badgeCheckboxes.filter(':checked').each(function () {
          totalBadgeMinutes += extractBadgeMinutes(this);
        });
  
        const selectedSlots = slotCheckboxes.filter(':checked').length;
        const requiredSlots = Math.max(1, Math.ceil(totalBadgeMinutes / 30));
        applySlotSelectionLock(requiredSlots, selectedSlots, true);
  
        if (errorDiv.length === 0) {
          errorDiv = $(`<div id="${errorDivId}" style="color: red; margin-bottom: 10px;"></div>`);
          form.find('#edit-field-appointment-slot-wrapper').before(errorDiv);
        }
  
        if (selectedSlots < requiredSlots) {
          errorDiv.text(`Please select enough slots. You selected ${selectedSlots} slot(s); ${requiredSlots} required for the selected badges (${totalBadgeMinutes} min total).`);
          return false;
        } else if (selectedSlots > requiredSlots && totalBadgeMinutes > 0) {
          errorDiv.text(`You have selected too many slots. You selected ${selectedSlots} slot(s); please select no more than ${requiredSlots} slot(s) for these badges.`);
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
      const badgesWrapper = form.find('#edit-field-appointment-badges');
      if (!badgesWrapper.length) return;

      const badgesContainer = form.find('#edit-field-appointment-badges-wrapper').length
        ? form.find('#edit-field-appointment-badges-wrapper')
        : badgesWrapper.closest('fieldset, .js-form-wrapper, .form-wrapper');

      const checkoutScopeId = 'badge-checkout-scope-message';
      if (!form.find('#' + checkoutScopeId).length) {
        form.find('#edit-field-appointment-slot-wrapper').before(
          '<div id="' + checkoutScopeId + '" style="display:none; margin-bottom:10px; color:#0f5132; background:#d1e7dd; border:1px solid #badbcc; border-radius:4px; padding:8px 12px;">' +
          'This appointment is for badge checkout. If you need broader advice or support beyond standard badging, please book a second appointment using General Informational / Advice.' +
          '</div>'
        );
      }

      function toggleBadgesByPurpose() {
        const purpose = form.find('input[name="field_appointment_purpose"]:checked').val();
        const isCheckout = purpose === 'checkout';
        badgesContainer.toggle(isCheckout);
        form.find('#' + checkoutScopeId).toggle(isCheckout);
        if (!isCheckout) {
          badgesWrapper.find('input[type="checkbox"]').prop('checked', false);
        }
      }

      // Admins can select any badge — skip all pending-only hints and locks.
      if (settings.bypassPendingCheck) {
        toggleBadgesByPurpose();
        form.find('input[name="field_appointment_purpose"]').on('change', toggleBadgesByPurpose);
        return;
      }

      const pendingTids = new Set((settings.pendingBadgeTids || []).map(Number));
      const pendingBadgeData = settings.pendingBadgeData || {};
      const allBadgeUrls = settings.allBadgeUrls || {};

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

      // Disable/enable non-pending checkboxes based on purpose.
      function updateCheckboxAvailability() {
        const purpose = form.find('input[name="field_appointment_purpose"]:checked').val();
        badgesWrapper.find('input[type="checkbox"]').each(function () {
          const tid = parseInt($(this).val(), 10);
          if (!isNaN(tid) && !pendingTids.has(tid)) {
            $(this).prop('disabled', purpose === 'checkout');
          }
        });
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

      form.find('input[name="field_appointment_purpose"]').on('change', function () {
        toggleBadgesByPurpose();
        updateCheckboxAvailability();
        updateSummary();
      });
      toggleBadgesByPurpose();
      updateCheckboxAvailability();
      updateSummary();
    }

  })(jQuery, Drupal, once);
