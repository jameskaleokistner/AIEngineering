import fs from "fs";
import path from "path";
import type { Employee } from "../types";

const employees: Employee[] = [
  {
    employeeId: "emp-001",
    name: "Alice Johnson",
    availability: [
      { dayOfWeek: 1, startHour: 6, endHour: 18 },
      { dayOfWeek: 2, startHour: 6, endHour: 18 },
      { dayOfWeek: 3, startHour: 6, endHour: 18 },
      { dayOfWeek: 4, startHour: 6, endHour: 18 },
      { dayOfWeek: 5, startHour: 6, endHour: 18 },
    ],
    maxHoursPerDay: 8,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-002",
    name: "Bob Smith",
    availability: [
      { dayOfWeek: 1, startHour: 8, endHour: 20 },
      { dayOfWeek: 2, startHour: 8, endHour: 20 },
      { dayOfWeek: 3, startHour: 8, endHour: 20 },
      { dayOfWeek: 4, startHour: 8, endHour: 20 },
      { dayOfWeek: 5, startHour: 8, endHour: 20 },
      { dayOfWeek: 6, startHour: 8, endHour: 18 },
    ],
    maxHoursPerDay: 10,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-003",
    name: "Carol Davis",
    availability: [
      { dayOfWeek: 0, startHour: 7, endHour: 17 },
      { dayOfWeek: 1, startHour: 7, endHour: 17 },
      { dayOfWeek: 2, startHour: 7, endHour: 17 },
      { dayOfWeek: 5, startHour: 7, endHour: 17 },
      { dayOfWeek: 6, startHour: 7, endHour: 17 },
    ],
    maxHoursPerDay: 8,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-004",
    name: "David Lee",
    availability: [
      { dayOfWeek: 2, startHour: 10, endHour: 22 },
      { dayOfWeek: 3, startHour: 10, endHour: 22 },
      { dayOfWeek: 4, startHour: 10, endHour: 22 },
      { dayOfWeek: 5, startHour: 10, endHour: 22 },
      { dayOfWeek: 6, startHour: 10, endHour: 22 },
    ],
    maxHoursPerDay: 10,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-005",
    name: "Eva Martinez",
    availability: [
      { dayOfWeek: 1, startHour: 6, endHour: 14 },
      { dayOfWeek: 2, startHour: 6, endHour: 14 },
      { dayOfWeek: 3, startHour: 6, endHour: 14 },
      { dayOfWeek: 4, startHour: 6, endHour: 14 },
      { dayOfWeek: 5, startHour: 6, endHour: 14 },
      { dayOfWeek: 6, startHour: 6, endHour: 14 },
    ],
    maxHoursPerDay: 8,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-006",
    name: "Frank Wilson",
    availability: [
      { dayOfWeek: 0, startHour: 12, endHour: 22 },
      { dayOfWeek: 3, startHour: 12, endHour: 22 },
      { dayOfWeek: 4, startHour: 12, endHour: 22 },
      { dayOfWeek: 5, startHour: 12, endHour: 22 },
      { dayOfWeek: 6, startHour: 12, endHour: 22 },
    ],
    maxHoursPerDay: 8,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-007",
    name: "Grace Kim",
    availability: [
      { dayOfWeek: 1, startHour: 8, endHour: 16 },
      { dayOfWeek: 2, startHour: 8, endHour: 16 },
      { dayOfWeek: 3, startHour: 8, endHour: 16 },
      { dayOfWeek: 4, startHour: 8, endHour: 16 },
      { dayOfWeek: 5, startHour: 8, endHour: 16 },
    ],
    maxHoursPerDay: 8,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-008",
    name: "Henry Brown",
    availability: [
      { dayOfWeek: 0, startHour: 6, endHour: 15 },
      { dayOfWeek: 1, startHour: 6, endHour: 15 },
      { dayOfWeek: 2, startHour: 6, endHour: 15 },
      { dayOfWeek: 5, startHour: 6, endHour: 15 },
      { dayOfWeek: 6, startHour: 6, endHour: 15 },
    ],
    maxHoursPerDay: 10,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-009",
    name: "Irene Taylor",
    availability: [
      { dayOfWeek: 1, startHour: 9, endHour: 21 },
      { dayOfWeek: 2, startHour: 9, endHour: 21 },
      { dayOfWeek: 3, startHour: 9, endHour: 21 },
      { dayOfWeek: 4, startHour: 9, endHour: 21 },
      { dayOfWeek: 5, startHour: 9, endHour: 21 },
      { dayOfWeek: 6, startHour: 10, endHour: 20 },
    ],
    maxHoursPerDay: 10,
    maxHoursPerWeek: 168,
  },
  {
    employeeId: "emp-010",
    name: "Jake Hernandez",
    availability: [
      { dayOfWeek: 0, startHour: 8, endHour: 20 },
      { dayOfWeek: 4, startHour: 8, endHour: 20 },
      { dayOfWeek: 5, startHour: 8, endHour: 20 },
      { dayOfWeek: 6, startHour: 8, endHour: 20 },
    ],
    maxHoursPerDay: 10,
    maxHoursPerWeek: 168,
  },
];

const outDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "roster.json"),
  JSON.stringify(employees, null, 2),
);
console.log(`Wrote ${employees.length} employees to data/roster.json`);
