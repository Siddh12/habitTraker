# Habit Tracker Project Plan

## Main Idea

Build a very simple personal app to track daily routine, habits, tasks, study/work progress, and daily expenses.

The app should not come with fixed default habits or tasks. When the user opens it for the first time, it should be empty and editable, so each person can create their own system.

The app should help track things like:

- Drinking water multiple times per day
- Wake-up time
- Exercise or running
- Study tasks
- Work tasks
- Personal tasks
- Daily spending
- Payment source, such as cash, credit card, bank account, UPI, or wallet

## Core Principle

The app should start as an empty daily overview.

Example first screen:

```text
Today

No trackers yet.

+ Add Habit
+ Add Task
+ Add Expense
+ Add Section
```

Nothing should be fixed at the start. The user creates their own sections, habits, tasks, and expense categories.

## Main UI Concept

The home screen should be an editable "Today Overview".

Example after the user adds their own items:

```text
Today - 26 Oct

Morning
Wake-up Time        6:45 AM
Drink Water         5 / 8 glasses    [+]

Fitness
Run                 Done
Exercise            Pending

Study
Math Revision       Done
Read Chapter        Pending

Money
Food                Rs.120 - UPI
Travel              Rs.50 - Cash
Total Today         Rs.170
```

All sections should be created and edited by the user.

## Tracker Types

Everything in the app can be treated as a tracker.

### 1. Checkbox Tracker

Used for something that is either done or not done.

Examples:

- Exercise
- Run
- Study
- Wake up early
- Meditation

Fields:

- Name
- Section
- Repeat rule
- Done or not done for today

### 2. Counter Tracker

Used for something that can happen multiple times in one day.

Examples:

- Drink water
- Pomodoro sessions
- Push-ups
- Cigarettes avoided
- Pages read

Example UI:

```text
Drink Water
Goal: 8 glasses

[-] 5 / 8 glasses [+]

Logs:
9:10 AM - 1 glass
11:30 AM - 1 glass
1:15 PM - 1 glass
```

Fields:

- Name
- Unit, such as glass, bottle, liter, times, pages, sessions
- Daily goal
- Section
- Repeat rule

### 3. Time Tracker

Used for tracking a time value or duration.

Examples:

- Wake-up time
- Sleep time
- Study duration
- Workout duration

Fields:

- Name
- Time or duration
- Section
- Repeat rule

### 4. Task Tracker

Used for study, work, or personal tasks.

Examples:

- Finish assignment
- Read chapter 3
- Submit work report
- Clean room

Fields:

- Task title
- Category, such as Study, Work, Personal
- Due date
- Repeat rule
- Status: Pending or Done
- Optional note

### 5. Expense Tracker

Used for daily spending.

Examples:

- Food
- Travel
- Shopping
- Bills
- Study material
- Health

Fields:

- Amount
- Category
- Source, such as Cash, Credit Card, Debit Card, Bank Account, UPI, Wallet
- Note
- Date

## Repeat Rules

Habits and tasks should support repetition.

Repeat options:

- No repeat
- Every day
- Selected days
- Weekly
- Monthly
- Custom

Example:

```text
Exercise
Repeat: Monday, Wednesday, Friday
```

Each day, the app should show the relevant repeat items on the Today screen.

## Main Screens

### 1. Today

This is the main screen.

It should show:

- Today's date
- User-created sections
- Today's habits
- Today's counters
- Today's tasks
- Today's expenses
- Total spending for today
- Quick add buttons

The Today screen should feel like a simple control panel.

### 2. Trackers

This screen is for managing created items.

User can:

- Add tracker
- Edit tracker
- Delete tracker
- Change section
- Change repeat rule
- Change goal or unit

### 3. History

This screen lets the user view previous days.

User can:

- Select a date
- See habits completed on that date
- See counter values for that date
- See tasks completed on that date
- See expenses for that date
- See total spending for that date

### 4. Reports

This can be added later.

Possible reports:

- Habit completion percentage
- Water goal completion
- Tasks completed this week
- Money spent today
- Money spent this week
- Spending by category
- Spending by source

## Add Tracker Flow

When the user taps Add, show options:

```text
What do you want to track?

[ Habit ]
[ Counter ]
[ Time ]
[ Task ]
[ Expense ]
[ Section ]
```

Then show only the fields needed for that tracker type.

Example for Counter:

```text
Name: Drink Water
Unit: Glass
Daily Goal: 8
Repeat: Every day
Section: Health
```

Example for Task:

```text
Task Name: Finish homework
Category: Study
Repeat: No repeat
Due Date: Today
```

Example for Expense:

```text
Amount: Rs.120
Category: Food
Source: UPI
Note: Lunch
```

## UX Rules

- The app should start empty.
- The user should be able to create their own setup.
- Every tracker should be editable.
- Counter trackers should support multiple entries per day.
- Repeated tasks and habits should automatically appear on the correct days.
- Expense tracking should include source of money.
- Adding a new item should be quick.
- The Today screen should be simple and not crowded.
- The app should work well on mobile and desktop.

## MVP Features

The first version should include:

1. Empty Today dashboard
2. Add, edit, and delete sections
3. Add, edit, and delete trackers
4. Tracker types: checkbox, counter, time, task, expense
5. Repeat rules for habits and tasks
6. Daily logs saved by date
7. History view by date
8. Total daily expense
9. Local browser storage

## Later Features

After the simple version works, these can be added:

- Reports and charts
- Weekly and monthly summaries
- Export to CSV or Excel
- Reminder notifications
- Login system
- Cloud database
- Mobile app version
- Backup and restore

## Suggested Tech Stack

For the first version:

- Frontend: React
- Styling: CSS or Tailwind CSS
- Storage: Browser localStorage
- Database: Not needed in first version

Later upgrade:

- Database: Firebase, Supabase, or PostgreSQL
- Authentication: Email login or Google login
- Hosting: Vercel or Netlify

## Simple Data Structure

```js
Tracker = {
  id,
  name,
  type, // checkbox, counter, time, task, expense
  sectionId,
  repeatRule,
  unit,
  goal,
  createdAt
}

Section = {
  id,
  name,
  order
}

DailyLog = {
  date,
  trackerId,
  value,
  entries,
  completed
}

Expense = {
  id,
  amount,
  category,
  source,
  note,
  date
}
```

## Final Direction

The app should be flexible, simple, and user-controlled.

The most important idea is this:

The app should not tell the user what to track. It should give the user a clean daily board where they can create their own habits, tasks, counters, routines, and expense logs.
