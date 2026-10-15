FROM mcr.microsoft.com/playwright/python:v1.58.0-noble
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY monitor.py .
RUN mkdir /app/data && chown -R pwuser:pwuser /app
USER pwuser
CMD ["python", "-u", "monitor.py"]
