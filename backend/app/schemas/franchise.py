"""Schemas for franchises."""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

class FranchiseBase(BaseModel):
    name: str = Field(..., description="The name of the franchise.")

class FranchiseCreate(FranchiseBase):
    pass

class FranchiseUpdate(BaseModel):
    name: Optional[str] = Field(None, description="The updated name of the franchise.")

class Franchise(FranchiseBase):
    id: int = Field(..., description="Unique database identifier for the franchise.")
    set_count: int = Field(0, description="Number of sets featuring characters from this franchise.")

    model_config = ConfigDict(from_attributes=True)
