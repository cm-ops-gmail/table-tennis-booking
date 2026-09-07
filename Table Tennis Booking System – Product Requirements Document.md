# Product Requirements Document (PRD)
## Table Tennis Booking & Management System

### 1. Product Overview

The organization has introduced a Table Tennis facility for employees. Since multiple employees cannot use the table at the same time, a centralized booking system is required to manage match schedules fairly and efficiently.

Employees will be able to access a booking link, select an available time slot, add teammates or opponents, and reserve the slot. The system will prevent scheduling conflicts and enforce daily booking restrictions.

The system will also include:

- Employee notifications
- Line Manager and HR notifications
- Admin slot management
- Full-day blocking
- Booking cancellation
- Employee rating and feedback portal

---

# 2. Objective

The objective of the Table Tennis Booking System is to:

1. Prevent conflicts in table tennis bookings.
2. Provide a transparent schedule visible to all employees.
3. Ensure fair usage of the table tennis facility.
4. Restrict employees from playing multiple matches on the same day.
5. Allow administrators to manage availability and block slots.
6. Notify relevant stakeholders about employee participation.
7. Collect employee feedback and ratings regarding the facility.

---

# 3. Users and Roles

The system will have the following user roles:

## 3.1 Employee

Employees can:

- View available slots.
- Book an available slot.
- Add other employees to their match/team.
- View booked slots.
- Cancel their own booking.
- Submit ratings and feedback.
- View blocked or unavailable slots.

---

## 3.2 Booking Owner

The employee who creates the booking will become the **Booking Owner**.

The Booking Owner can:

- Create the booking.
- Add participating employees.
- Cancel the booking.

Only the Booking Owner can cancel that specific booking.

Other participants cannot cancel the booking.

---

## 3.3 Administrator / HR Admin

Administrators will have access to an Admin Panel.

Administrators can:

- View all bookings.
- View employee participation history.
- Block individual slots.
- Add notes to blocked slots.
- Block an entire day.
- Add notes for full-day blocks.
- Unblock slots or dates.
- Manage rating questions.
- View employee ratings and feedback.
- Monitor system activity.

---

# 4. Operating Schedule

The Table Tennis facility will operate between:

**Start Time:** 1:00 PM  
**End Time:** 5:30 PM

---

# 5. Slot Configuration

Each match will have:

- **Match Duration:** 30 minutes
- **Gap Between Matches:** 10 minutes

Therefore, each booking cycle will occupy a 40-minute interval.

### Example Schedule

| Slot | Match Time | Gap |
|---|---|---|
| Slot 1 | 1:00 PM – 1:30 PM | 1:30 PM – 1:40 PM |
| Slot 2 | 1:40 PM – 2:10 PM | 2:10 PM – 2:20 PM |
| Slot 3 | 2:20 PM – 2:50 PM | 2:50 PM – 3:00 PM |
| Slot 4 | 3:00 PM – 3:30 PM | 3:30 PM – 3:40 PM |
| Slot 5 | 3:40 PM – 4:10 PM | 4:10 PM – 4:20 PM |
| Slot 6 | 4:20 PM – 4:50 PM | 4:50 PM – 5:00 PM |
| Slot 7 | 5:00 PM – 5:30 PM | — |

The system should automatically generate and manage these slots.

---

# 6. Booking Process

## 6.1 Accessing the Booking System

Employees will receive or access a dedicated booking link.

After entering the system, employees should be able to:

1. Select a date.
2. View available and unavailable slots.
3. Select an available slot.
4. Add participating employees.
5. Confirm the booking.

---

## 6.2 Slot Status

Slots should visually display their current status.

Possible statuses:

- **Available**
- **Booked**
- **Blocked by Admin**
- **Full Day Unavailable**

Once a slot is booked:

- The slot must immediately display as **Booked**.
- Other employees must not be able to book the same slot.

---

# 7. Player Requirements

Each booking must include:

### Minimum Players
**2 employees**

### Maximum Players
**4 employees**

Each participant must include:

- Employee Name
- Employee ID

The system should validate that:

- At least 2 players are included.
- No more than 4 players are included.
- The same employee cannot be added multiple times to the same booking.

---

# 8. Team / Player Addition

The Booking Owner can add other employees when creating a booking.

Example:

**Booking Owner:** Employee A

Participants:

1. Employee A
2. Employee B
3. Employee C
4. Employee D

The Booking Owner may book for:

- Themselves and one additional employee.
- Themselves and multiple employees.
- A maximum total of 4 players.

---

# 9. Daily Booking Restriction

To ensure fair usage of the table tennis facility:

## Core Rule

An employee cannot participate in more than one booking on the same day.

This rule applies to:

- The Booking Owner.
- Every employee added to the booking/team.

### Example

If Employee A plays from:

**1:00 PM – 1:30 PM**

Employee A cannot:

- Create another booking later that day.
- Be added as a participant to another booking that day.

Similarly, if Employee B is included in a match, Employee B cannot participate in another booking on the same date.

The system must validate all selected participants before confirming a booking.

---

# 10. Booking Cancellation

A booking will have a cancellation option.

However:

## Cancellation Permission Rule

Only the employee who originally created the booking can cancel it.

Other team members or participants:

- Cannot cancel the booking.
- Cannot modify the booking.

When a booking is cancelled:

1. The slot becomes available again.
2. The booking status changes to **Cancelled**.
3. Relevant notifications should be sent.
4. The cancellation should be recorded for administrative purposes.

---

# 11. Notifications

The system should send notifications whenever a booking is successfully created.

Notifications should be sent to:

## 11.1 Participating Employees

All employees included in the booking should receive a notification containing:

- Booking date
- Match time
- Player names
- Booking Owner

---

## 11.2 Line Manager

The Line Manager of each participating employee should receive an email notification.

The notification should mention:

- Employee Name
- Employee ID
- Booking Date
- Match Time
- Other match participants

---

## 11.3 HR Admin

HR Admin should also receive booking notifications.

Notifications should include:

- Booking Owner
- Participating Employees
- Employee IDs
- Booking Date
- Booking Slot

---

## 11.4 Cancellation Notifications

When a booking is cancelled, notifications should be sent to:

- All participants.
- Relevant Line Managers.
- HR Admin.

---

# 12. Admin Panel

The system will include a dedicated Admin Panel.

Only authorized administrators will have access.

---

## 12.1 Admin Dashboard

The Admin Dashboard should provide:

- Total bookings.
- Today's bookings.
- Upcoming bookings.
- Cancelled bookings.
- Blocked slots.
- Employee participation history.
- Rating and feedback overview.

---

## 12.2 Individual Slot Blocking

An administrator can block a specific slot.

Example:

**Date:** September 10  
**Slot:** 3:00 PM – 3:30 PM

Admin may enter a reason:

> Table maintenance

The slot will display as:

**Blocked**

Employees will not be able to book that slot.

---

## 12.3 Full-Day Blocking

Administrators can block the entire Table Tennis facility for a specific day.

Example:

**Date:** September 15

Reason:

> Office Event

When an entire day is blocked:

- No slots will be available.
- Employees cannot create bookings.
- The date should visually display as unavailable.

---

## 12.4 Unblocking

Administrators should be able to:

- Unblock individual slots.
- Remove full-day blocks.
- Update block notes.

---

# 13. Rating & Feedback Portal

The system will include a dedicated Rating Portal.

Employees who participate in table tennis matches should be able to submit feedback.

The rating portal may collect feedback related to:

- Table quality.
- Playing experience.
- Booking experience.
- Facility availability.
- Overall satisfaction.

---

# 14. Dynamic Rating Questions

Rating questions should not be permanently hardcoded.

HR/Admin must be able to manage rating questions through the Admin Panel.

Administrators can:

- Add questions.
- Edit questions.
- Delete questions.
- Activate or deactivate questions.
- Change question types.

Possible question types:

- Star Rating
- Scale Rating (1–5)
- Yes/No
- Multiple Choice
- Open Text Feedback

---

# 15. Rating Submission

The Rating Portal should:

1. Identify the employee.
2. Identify the relevant booking or match.
3. Display active rating questions.
4. Allow employees to submit responses.

Each employee should only submit one rating for the relevant booking unless the system allows editing.

---

# 16. Authentication and Employee Identification

The system should identify employees before allowing them to book.

Employee information should include:

- Employee Name
- Employee ID
- Official Email Address
- Line Manager Information

Only authorized employees should be able to access the booking system.

---

# 17. Database and Integration

The primary database for the system will be **Google Sheets**.

The application will communicate with Google Sheets securely through a **Service Account**.

Configuration requirements include:

- Google Sheet ID
- Service Account Credentials
- Service Account Email
- Private Key

These credentials must be securely stored and must not be exposed on the frontend.

---

# 18. Booking Validation Rules

Before confirming a booking, the system must validate:

### Rule 1
Selected slot must be available.

### Rule 2
Minimum participant count must be 2.

### Rule 3
Maximum participant count must be 4.

### Rule 4
Every participant must have:

- Employee Name
- Employee ID

### Rule 5
The Booking Owner cannot already have another booking on the same day.

### Rule 6
Any added participant cannot already have another booking on the same day.

### Rule 7
The selected slot cannot be blocked.

### Rule 8
The selected date cannot be blocked for the entire day.

### Rule 9
Duplicate employees cannot be added to the same booking.

---

# 19. Important Booking Conflict Scenario

### Scenario

Employee A creates a booking:

**Date:** September 10  
**Time:** 1:00 PM – 1:30 PM

Players:

- Employee A
- Employee B
- Employee C

Later, Employee D tries to create another booking on September 10 and adds Employee B.

### Expected Result

The system should reject Employee B.

Reason:

> Employee B has already participated in a Table Tennis booking on this date.

Employee D must select another available employee.

---

# 20. User Interface Requirements

The Employee Portal should include:

### Main Booking Page

- Date selector
- Daily schedule
- Available slots
- Booked slots
- Blocked slots
- Booking button

---

### My Bookings Page

Employees should be able to see:

- Their upcoming booking.
- Booking date.
- Match time.
- Other participants.
- Booking status.

The Booking Owner should see:

- Cancel Booking option.

Other participants should not see the cancellation option.

---

# 21. Admin Panel Modules

The Admin Panel should include the following modules:

## A. Dashboard

Overview of:

- Total bookings.
- Today's bookings.
- Upcoming matches.
- Cancelled matches.

---

## B. Booking Management

Admin can:

- View all bookings.
- Filter by date.
- Filter by employee.
- Filter by booking status.

---

## C. Slot Management

Admin can:

- Block individual slots.
- Unblock slots.
- Add block notes.

---

## D. Date Management

Admin can:

- Block an entire date.
- Add a reason.
- Remove the block.

---

## E. Rating Management

Admin can:

- Create rating questions.
- Edit rating questions.
- Delete rating questions.
- Enable or disable questions.

---

## F. Rating Reports

Admin can view:

- Individual responses.
- Average ratings.
- Question-wise results.
- Employee feedback.

---

# 22. Employee Booking Workflow

Employee visits booking link

↓

Selects a date

↓

Views available slots

↓

Selects a slot

↓

Adds participants

↓

System validates all employees

↓

Booking is confirmed

↓

Slot becomes **Booked**

↓

Notifications are sent

---

# 23. Admin Blocking Workflow

Admin logs into Admin Panel

↓

Selects date

↓

Selects individual slot OR full-day block

↓

Adds blocking note

↓

Confirms block

↓

Employees see the slot or date as unavailable

---

# 24. Rating Workflow

Employee completes or participates in a match

↓

Employee visits Rating Portal

↓

System identifies the relevant booking

↓

Active questions are displayed

↓

Employee submits responses

↓

HR/Admin can view rating results and feedback

---

# 25. Final Product Definition

The Table Tennis Booking & Management System will be an internal employee platform that allows employees to reserve Table Tennis match slots between **1:00 PM and 5:30 PM**, with **30-minute matches and 10-minute intervals between matches**.

Each booking will require a **minimum of 2 players and a maximum of 4 players**.

Every participant will be validated to ensure that they have not already participated in another match on the same day.

The system will provide:

- Employee booking management
- Team/player addition
- Booking cancellation
- Real-time slot availability
- Employee participation restrictions
- Notifications to employees
- Email notifications to Line Managers
- HR Admin notifications
- Admin controls for blocking individual slots
- Full-day blocking functionality
- Configurable employee rating questions
- Employee feedback and rating portal
- Google Sheets integration through a secure Service Account

The system is designed to ensure a **fair, transparent, and organized process for managing the organization's Table Tennis facility**.