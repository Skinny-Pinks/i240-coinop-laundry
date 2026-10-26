"""Offline tests of the public I-240 attendant projection."""
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from build_public_attendant import project_attendance

LOCAL = ZoneInfo("America/Chicago")


def now_at(hour, minute):
    return datetime(2026, 10, 26, hour, minute, tzinfo=LOCAL)


def fixture():
    return {"ok": True, "data": {"I240": {"Schedule": [
        {"Date": "2026-10-26", "StartTime": "8:00 AM", "EndTime": "2:00 PM",
         "DefaultEmployee": "John-Paul", "OpenPayrollRows": 1,
         "ActualWorkers": [{"EmployeeName": "John-Paul", "ClockInTime": "8:00 AM",
                            "ClockOutTime": "12:24 PM", "IsOpen": True,
                            "EndSource": ""}]},
        {"Date": "2026-10-26", "StartTime": "2:00 PM", "EndTime": "9:00 PM",
         "DefaultEmployee": "MELVIN LEWIS", "OpenPayrollRows": 0,
         "ActualWorkers": []},
    ]}}}


class AttendanceProjectionTest(unittest.TestCase):
    def test_clocked_in(self):
        result = project_attendance(fixture(), now_at(12, 33))
        self.assertEqual(result["status"], "on_duty")
        self.assertEqual(result["attendants"], ["John-Paul"])
        self.assertEqual(set(result), {
            "version", "store", "status", "attendants", "checkedAt"
        })

    def test_future_shift_not_published(self):
        result = project_attendance(fixture(), now_at(14, 15))
        self.assertEqual(result["status"], "not_confirmed")
        self.assertEqual(result["attendants"], [])

    def test_after_close(self):
        self.assertEqual(
            project_attendance(fixture(), now_at(21, 5))["status"],
            "outside_hours"
        )

    def test_closed_worker_not_on_duty(self):
        data = fixture()
        worker = data["data"]["I240"]["Schedule"][0]["ActualWorkers"][0]
        worker["IsOpen"] = False
        worker["EndSource"] = "Clock Out"
        result = project_attendance(data, now_at(12, 33))
        self.assertEqual(result["status"], "not_confirmed")

    def test_invalid_response_is_unavailable(self):
        self.assertEqual(
            project_attendance({"ok": False}, now_at(12, 33))["status"],
            "unavailable"
        )

    def test_only_public_first_name(self):
        data = fixture()
        worker = data["data"]["I240"]["Schedule"][0]["ActualWorkers"][0]
        worker["EmployeeName"] = "MELVIN LEWIS"
        result = project_attendance(data, now_at(12, 33))
        self.assertEqual(result["attendants"], ["Melvin"])


if __name__ == "__main__":
    unittest.main()
