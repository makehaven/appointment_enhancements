# Appointment Enhancements Module

## 1. Overview

The **Appointment Enhancements** module provides critical user interface (UI) and user experience (UX) improvements for the "Appointment" content type in Drupal. Its primary goal is to make the appointment scheduling process more intuitive, prevent common errors like double-booking, and add clarity to the form.

This module is specifically designed to work with the appointment creation form at `/node/add/appointment` and the corresponding edit forms at `/node/*/edit`.

---

## 2. Core Problems and Solutions

This module was created to solve several key challenges with the default appointment scheduling form.

### A. Preventing Double Bookings

* **Problem:** The appointment form uses simple checkboxes for half-hour time slots (e.g., "1st slot", "2nd slot"). Without intervention, there is nothing to stop multiple users from selecting the same time slot for the same date and facilitator, leading to double bookings.
* **Solution:**
    1.  A hidden Drupal View (`scheduled_appointment_slots`) is used to generate a list of all currently reserved time slots for a given facilitator.
    2.  The module programmatically injects this View's data directly onto the `/node/add/appointment` page.
    3.  A JavaScript behavior (`disableReservedSlots`) then reads this data and dynamically disables the checkboxes for any slots that are already taken on the selected date, graying them out so they are visibly unavailable.

### B. Displaying Actual Times on Slots

* **Problem:** The slot labels are generic ("1st slot", "2nd slot") and do not display a specific time. The actual time is relative to a volunteer's shift, which is passed to the form as a `start_time` parameter in the URL (e.g., `?start_time=6:00pm`). Users have no immediate way of knowing the actual time they are booking.
* **Solution:**
    1.  A JavaScript behavior (`displaySlotTimes`) reads the `start_time` parameter from the page URL.
    2.  It then iterates through each slot checkbox, calculates its absolute time by adding 30-minute increments to the start time, and appends the formatted time (e.g., `(6:30pm)`) in green next to the label. This provides immediate clarity to the user.

### C. Validating Time for Badge Checkouts

* **Problem:** When a user selects "Badge Checkout" as the appointment purpose, they must select enough 30-minute time slots to cover the total estimated time for all the badges they have chosen. The default form has no mechanism to enforce this.
* **Solution:**
    1.  The module includes a JavaScript validation function (`initializeSlotCoverageValidation`) that runs in real-time on the form.
    2.  It listens for changes on the "Purpose" radio buttons, the "Badges" checkboxes, and the "Slot" checkboxes.
    3.  It dynamically calculates the total required minutes for the selected badges and compares it against the total minutes for the selected slots.
    4.  If the selected time is insufficient, a clear error message is displayed on the form. The form's submission is also blocked until the validation passes.

### D. Preventing Unintended Edits

* **Problem:** Once an appointment is created, critical details such as the date, facilitator, purpose, and time slots should not be easily changed, as this could disrupt schedules or lead to data inconsistencies.
* **Solution:**
    1.  A separate, lightweight JavaScript file is attached **only** to the appointment edit form (`/node/*/edit`).
    2.  This script makes the key fields (Title, Facilitator, Date, Purpose, and Slots) read-only or disabled, effectively locking them from being modified post-creation.

---

## 3. Technical Implementation

The module is self-contained and encapsulates all related configuration and code.

* **`appointment_enhancements.info.yml`**: Defines the module and its dependency on the Views module.
* **`appointment_enhancements.module`**:
    * Implements `hook_form_alter()` to target the `node_appointment_form` and `node_appointment_edit_form`.
    * Attaches the appropriate JavaScript libraries to each form.
    * **Crucially, it programmatically embeds the `scheduled_appointment_slots` view** into the add form, removing the need for any manual block placement.
* **`appointment_enhancements.libraries.yml`**: Defines two separate JavaScript libraries:
    1.  `appointment-add-form`: The main script with all features for the creation form.
    2.  `appointment-edit-form`: The lightweight script for locking down the edit form.
* **`js/` directory**: Contains the JavaScript files, which use the standard `Drupal.behaviors` pattern for robust and predictable execution.
* **`config/install/` directory**: Contains the YAML configuration files for the three essential Views:
    1.  `views.view.appointments.yml`: The main view for listing all appointments.
    2.  `views.view.scheduled_appointment_slots.yml`: The data source view used by the JavaScript to prevent double bookings.
    3.  `views.view.scheduled_appointments.yml`: A supplemental view for displaying appointments.

## 4. Installation and Management

1.  Place the `appointment_enhancements` module folder in your site's `/modules/custom` directory.
2.  Enable the module through the Drupal admin UI or with Drush (`drush en appointment_enhancements`).
3.  Upon installation, the three required Views will be automatically created and configured.
4.  **There is no need to use the JS Injector module or manually place any blocks.** This module handles all of its own setup. To modify the JavaScript, edit the files directly within the module's `js/` directory and clear Drupal's cache.