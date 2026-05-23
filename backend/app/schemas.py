from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ChatResponse(BaseModel):
    text: str
    delivered: bool = True
