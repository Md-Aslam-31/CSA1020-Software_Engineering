"""A fixed, independently checked HTTP contract for FocusLane smoke checks."""


def sample_plan():
    return {
        'planName': 'Exam preparation', 'startDate': '2026-11-02', 'dailyMinutes': 90, 'horizonDays': 3,
        'subjects': [
            {'id': 'math', 'name': 'Mathematics', 'minutes': 90, 'priority': 'medium'},
            {'id': 'cs', 'name': 'Computer Science', 'minutes': 120, 'priority': 'high'},
            {'id': 'writing', 'name': 'Writing', 'minutes': 45, 'priority': 'low'},
        ],
    }


def verify_plan(envelope):
    data = envelope['data']
    assert data['totalTargetMinutes'] == 255, 'Target minutes differ from the request.'
    assert data['plannedMinutes'] == 255, 'The complete example must fit.'
    assert data['remainingMinutes'] == 0, 'No example work should remain.'
    assert data['totalCapacityMinutes'] == 270, 'Three days at 90 minutes must provide 270 minutes.'
    assert data['utilizationPercent'] == 94, 'Expected rounded utilization is 94 percent.'
    assert [day['date'] for day in data['days']] == ['2026-11-02', '2026-11-03', '2026-11-04']
    assert [day['plannedMinutes'] for day in data['days']] == [90, 90, 75]
    assert data['days'][0]['sessions'][0]['subjectId'] == 'cs', 'High priority work must be scheduled first.'
    assert all(day['plannedMinutes'] <= day['capacityMinutes'] for day in data['days'])
    return {'targetMinutes': 255, 'plannedMinutes': 255, 'remainingMinutes': 0,
            'dailyMinutes': [90, 90, 75], 'highPriorityFirst': True}
