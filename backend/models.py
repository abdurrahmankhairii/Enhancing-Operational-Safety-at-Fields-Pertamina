from pydantic import BaseModel

class WorkerUpdate(BaseModel):
    employee_id: str
    name: str
    company: str
    role: str
    status_sim_l: str

class CCTV(BaseModel):
    name: str
    ip_address: str
    location: str