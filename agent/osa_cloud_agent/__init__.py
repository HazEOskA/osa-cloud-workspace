"""OSA Cloud Agent Phase 1 package.

Import the runtime explicitly from ``osa_cloud_agent.agent``. Keeping the
package initializer dependency-free lets policy and safety tests run without
loading the full ADK runtime.
"""

__all__: list[str] = []
