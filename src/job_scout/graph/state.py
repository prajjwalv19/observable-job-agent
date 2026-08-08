"""The LangGraph state schema threaded through every node."""

from __future__ import annotations

from typing import TypedDict

from job_scout.graph.schemas import FabricationReport, JobPosting, Profile, RankedJob, TailoringPack


class AgentState(TypedDict, total=False):
    """Mutable state passed between nodes.

    ``total=False`` lets nodes return partial updates and lets the initial invoke
    payload set only the fields it has. ``llm_calls``, ``errors`` and
    ``jobs_sources`` back the call budget, non-crashing error handling and trace
    metadata respectively.

    Phase 2 fields: ``selected_job_id`` drives the entry router (set → tailor,
    unset → job search). ``linkedin_zip_path`` is a filesystem path only — the
    export ZIP itself is never logged, committed, or attached to a trace.
    ``fabrication_flags``/``fabrication_report`` are written by the
    ``validate_tailoring`` node. ``jsearch_extra_params`` carries the human-set
    advanced JSearch filters from the UI (see ``JSEARCH_PARAM_REGISTRY`` in
    ``tools/jobs_api.py``) through to ``fetch_jobs``.
    """

    cv_text: str
    profile: Profile | None
    search_query: str | None
    jsearch_extra_params: dict[str, object] | None
    jobs: list[JobPosting]
    ranked_jobs: list[RankedJob]
    reformulation_count: int
    llm_calls: int
    errors: list[str]
    jobs_sources: list[str]
    tailoring: TailoringPack | None
    selected_job_id: str | None
    linkedin_zip_path: str | None
    research_notes: str | None
    fabrication_flags: int
    fabrication_report: FabricationReport | None
