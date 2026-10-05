from pathlib import Path
from reportlab.pdfgen.canvas import Canvas
path = Path(__file__).parent / "student-profile.pdf"
canvas = Canvas(str(path))
canvas.setFont("Helvetica", 14)
canvas.drawString(60, 780, "Student writing profile")
canvas.setFont("Helvetica", 11)
canvas.drawString(60, 745, "Students can state an invitation purpose but sometimes miss event details.")
canvas.drawString(60, 725, "Use a checklist for purpose, time, place, and polite closing.")
canvas.drawString(60, 705, "This is fictional development data, not an actual class record.")
canvas.save()
