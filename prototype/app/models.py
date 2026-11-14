from typing import Literal

from pydantic import BaseModel, Field


ClaimStatus = Literal['Sourced', 'Validated', 'Proposed', 'Conflicted', 'Unknown']
CandidateStatus = Literal['Proposed', 'Accepted', 'Rejected', 'Conflicted', 'Promoted']


class Citation(BaseModel):
    chunk_id: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    text: str = Field(min_length=1)


class Section(BaseModel):
    title: str
    content: str = ''
    status: ClaimStatus = 'Sourced'
    citations: list[Citation] = Field(default_factory=list)
    canonical_ids: list[str] = Field(default_factory=list)


class DraftPayload(BaseModel):
    skill: str
    title: str
    summary: str
    sections: list[Section]


class GenerateRequest(BaseModel):
    skill: Literal['workshop_report', 'fit_gap', 'steering_deck']
    provider: Literal['mock', 'live'] = 'mock'


class ReviewRequest(BaseModel):
    action: Literal['approve_report', 'flag_conflict', 'approve_change']


class PublishRequest(BaseModel):
    draft_id: str


class GatewayResult(BaseModel):
    content: dict
    provider: str
    model: str
    mode: str
    latency_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    fixture_id: str = ''
