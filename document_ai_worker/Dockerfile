# Document AI Microservice Dockerfile
# Optimized for Hugging Face Spaces (16GB RAM Free Tier) and standard Docker hosts

FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

# Install required Linux C++ system packages for OCR & PDF rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgl1 \
    libglib2.0-0 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create non-root user (Standard for Hugging Face Spaces security)
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app /tmp
USER appuser

# Expose standard Hugging Face port
EXPOSE 7860

# Run FastAPI server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
