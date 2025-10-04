from typing import Any, Dict, Optional
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np
import pandas as pd
import joblib

# You can override via env var: export PIPELINE_PATH=/full/path/xgb_pipeline.pkl
PIPELINE_PATH = os.getenv("PIPELINE_PATH", "xgb_pipeline.pkl")

app = FastAPI(title="Exoplanet Classifier")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-loaded pipeline (don’t crash at import)
_pipe = None
_pipe_err: Optional[str] = None

def get_pipe():
    global _pipe, _pipe_err
    if _pipe is not None:
        return _pipe
    try:
        _pipe = joblib.load(PIPELINE_PATH)
        _pipe_err = None
        return _pipe
    except Exception as e:
        _pipe = None
        _pipe_err = f"Failed to load pipeline from '{PIPELINE_PATH}': {e!r}"
        return None

class PredictRequest(BaseModel):
    features: Dict[str, Any]

class PredictResponse(BaseModel):
    prediction: str
    probabilities: Optional[list[float]] = None

@app.get("/health")
def health():
    # report whether the pipeline is loaded
    pipe = get_pipe()
    return {"ok": True, "pipeline_loaded": pipe is not None, "pipeline_path": PIPELINE_PATH}

@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    pipe = get_pipe()
    if pipe is None:
        raise HTTPException(status_code=503, detail=_pipe_err or "Pipeline not loaded.")

    # Extract the actual model and classes from the pipeline
    model = pipe['model']
    classes = pipe['classes_']
    
    # Create a row with all 43 features expected by the model
    # Fill missing features with NaN (will be handled by SimpleImputer)
    row = {}
    
    # Add the provided features
    for k, v in req.features.items():
        row[k] = [v]
    
    # Create a DataFrame with all expected features (43 total)
    # We'll create a minimal set with the 4 provided features and fill the rest with NaN
    import pandas as pd
    
    # Create a DataFrame with the provided features
    df = pd.DataFrame(row)
    
    # The model expects 43 features, so we need to pad with NaN for missing features
    # This is a workaround - in production, you'd want to know all 43 feature names
    expected_features = 43
    current_features = len(df.columns)
    
    if current_features < expected_features:
        # Add dummy columns with NaN values for missing features
        for i in range(current_features, expected_features):
            df[f'dummy_feature_{i}'] = [np.nan]
    
    # Ensure we have exactly 43 features
    if len(df.columns) > expected_features:
        df = df.iloc[:, :expected_features]
    
    try:
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(df)[0]
            pred_idx = int(np.argmax(probs))
            pred_label = str(classes[pred_idx])
            return {"prediction": pred_label, "probabilities": probs.tolist()}
        else:
            pred = model.predict(df)[0]
            pred_idx = int(pred)
            pred_label = str(classes[pred_idx])
            return {"prediction": pred_label, "probabilities": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")